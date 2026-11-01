/**
 * The 3D page (/3d, 2026-10-23): one page like Image, Video and Audio. The feed is above (3D results as stills; one live viewer at a
 * time), the bar below is the same two-row dock (Image's ic-dock classes, Video's layout): the workflow chip first in row 2, the model chip
 * with the shared ModelMenu (Default badge), the model's own setting chips (WorkflowControls: Detail, Texture), Format, the Settings fold
 * (seed), Run on, the prompt peek, and Generate with price · time or the first problem (PF_SHORT) and the "Before you generate" list.
 *  - Workflows (server shared/threeD.ts): Image to 3D runs on tool three-d; Turntable video records an orbit in the browser (free);
 *    Text to 3D and Multi-view to 3D use the same Tripo runner; Retexture and Rig remain coming soon.
 *  - Empty feed: "Made with these models", examples from Scenario's open dataset (CC BY 4.0), loaded from Hugging Face at runtime.
 *  - Links: ?fromJob=<image job>&out=<n> puts that image in the slot (Send to 3D); a 3D result's "Make a video" records its turntable.
 *  - Direct a Shot (tool id plan-a-shot, 2026-10-24, shared/previzTemplates.ts): the main area becomes the shared player (shared/PrevizPlayer.tsx); the bar holds the
 *    preset slot, "Describe your shot", the Camera / Frame / Colour / Record chips (shared WorkflowControls with our panels) and Record mockup.
 *    Recording is frame-exact in the browser (shared/previz/capture.ts) and lands in the feed as a free MP4 job (tool plan-a-shot).
 *    The single floating bar (2026-10-26): the stage fills the first screen; the dock shows only the step you are on (state.step, saved):
 *    Stage (note; Camera, Colour; the player's Fly it / Play the actor; Next), Mockup (the player's takes, timeline and Edit take; Record mockup),
 *    Render (the newest mockup; model, price; Render video). Preview style, Frame, Record and the seed live in the ⋯ menu on the stage.
 */
import { IMAGE_PAGE } from '../../../../server/src/shared/pages';
import { IMAGE_ACCEPT, fileFits, wrongTypeText } from '../../../../server/src/shared/mediaAccept';
import { RowMore } from '../../shared/RowMore';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { appFileName } from '../../shared/brand';
import type { JobState, ToolInfo } from '../../api';
import { createJob, getJob, listJobs, issuesOf, retryJob } from '../../api';
import { navigate, useSearch } from '../../platform/router';
import { tip } from '../../shared/Tooltip';
import { useToast } from '../../shared/Toast';
import { BarPopover, PopSection, PopList, PopRow } from '../../shared/BarPop';
import { ModelMenu, type MenuItem } from '../../shared/ModelMenu';
import { MakerTile } from '../../shared/MakerTile';
import { GenPrice, priceTitle } from '../../shared/GenPrice';
import { shownCredits, unpricedReason, unpricedPrefix, runBlock } from '../../shared/quote';
import { useBilling, ownAccountsNow, modeOf } from '../../shared/billing';
import { useVariantQuotes, optionDelta, type Overrides } from '../../shared/optionPrice';
import { addKeyText, KeyNeeded, hasFreeLocal } from '../../shared/KeyNeeded';
import { SetupGenerate, setupNeeded } from '../../shared/SetupCard';
import { nudgeMissing } from '../../shared/genNudge';
import GenTile from '../../shared/GenTile';
import { SceneGrid, type SceneItem } from '../../shared/SceneGrid';
import { useSceneThumbs } from '../../shared/previz/thumbs';
import { MIR_PROMPT_KEY } from '../../shared/MakeItReal';
import FailureState from '../../shared/FailureState';
import { useToolModels, modelOfEngine, useRunOn, shownName } from '../../shared/models';
import { isOpenWeights, displayNameOf } from '../../shared/OpenWeights';
import { durationText, jobTiming } from '../../shared/jobTiming';
import { etaText } from '../../shared/queueActivity';
import { preflightProblems } from '../../../../server/src/shared/preflight';
import { THREE_D_WORKFLOWS, THREE_D_CATEGORIES, THREE_D_PAGE, threeDRoute, threeDWorkflowById, currentThreeDWorkflow, threeDModel, normalizeSettings, threeDPicksParam, DETAILS, TEXTURES, FACES, type ThreeDWorkflow, type ThreeDModel, type ShowcaseItem, THREE_D_VIEW_SLOTS, threeDSupportsMode, threeDViewIssue, threeDMode, threeDPriceNote } from '../../../../server/src/shared/threeD';
import { PF_SHORT } from '../../shared/DockGenerate';
import { recipeFor } from '../../shared/threeDRecipe';
import { PromptPeek, type PeekForm } from '../next/PromptPeek';
import { WorkflowControls, WorkflowInputs, WfIcon, useWorkflowQuote, loadDraft, saveDraft, type WfRecipe, type WfSlotFile } from '../next/WorkflowBar';
import { HowSteps } from '../video/VideoWorkflows';
import { WorkflowPicker, wantsPicker, usePickerParam, clearPickerParam } from '../../shared/WorkflowPicker';
import { WorkflowChip } from '../../shared/WorkflowChip';
import { FeedCaption, jobCaption } from '../../shared/FeedCaption';
import { PreflightNotes } from '../../shared/PreflightNotes';
import { useChipFit, useDockHeight } from '../../shared/dockFit';
import { RunOnChip, runOnText } from '../routing/RunOn';
import { QueueLine } from '../edge/Edge';
import { DownloadIcon, MoreIcon, VideoIcon, CubeIcon, OrbitIcon, PrevizIcon, SparkleIcon, UploadIcon, DocsIcon, ImageIcon, CharacterSheetIcon } from '../Icons';
import { Segmented, AspectShape, aspectWH } from '../../shared/BarPop';
import { PrevizPlayer, type PrevizHandle, type ImportedScene, type PlanStep, type ReadyTake } from '../../shared/PrevizPlayer';
import { MakeItRealSheet, useRenderPipe } from '../../shared/MakeItReal';
import { MAKE_REAL_TOOL, MAKE_REAL_SIZES, MAKE_REAL_DEFAULT_SIZE, MAKE_REAL_DEFAULT_FRAMES, makeRealEtaSeconds, minutesText, aspectOf } from '../../../../server/src/shared/makeItReal';
import { askConfirm } from '../../shared/Dialog';
import { captureShot, savePlanShot, type CaptureProgress, type CaptureResult } from '../../shared/previz/capture';
import type { SceneStatus } from '../../shared/previz/importScene';
import { PREVIZ_TEMPLATES, PREVIZ_MOVES, PREVIZ_SPEEDS, PREVIZ_ASPECTS, PREVIZ_FPS, PREVIZ_PASSES, PREVIZ_COLOURS, PREVIZ_MIN_SECONDS, PREVIZ_MAX_SECONDS, PREVIZ_TOOL, colourOf, previzTemplate, defaultPlanShot, normalizePlanShot, chosenTake, shotForJob, clampSeconds, buildPromptFor, checkSceneHtml, SCENE_HTML_MAX_BYTES, type PlanShot, type PrevizPass, type PrevizTemplateId } from '../../../../server/src/shared/previzTemplates';
import { Viewer3D, useMeta3d, type Item3D } from '../../shared/Viewer3D';
import { Model3D, jobIs3d, posterOf3d, edgeBusyness, startOrbitOf, type Model3DHandle } from '../../shared/model3d';
import { savePoster } from '../../shared/Viewer3D';
import ResultView from '../../shared/ResultView';
import { useFeedViewer, FeedH1 } from '../next/feed/ResultFeed';
import { goToWorkflow } from '../../shared/goToWorkflow';
import { directShotHref } from '../../shared/workflowLinks';
import { carryModels } from '../../../../server/src/shared/previzModels';
import { actorStart } from '../../../../server/src/shared/previzActor';
import { KINDS, kindOfJob, countKinds, shownKinds, videoCardPoster, planPoster, metaShort, exampleModel, mockupForShot, type FeedKind } from './feed3d';
import '../next/workflowBar.css';
import '../next/createBar.css'; /* the shared chip-fit steps (drop group words, truncate): without it the row overflowed under Record mockup until Image had been opened */
import '../video/videoPanel.css';
import '../video/videoDock.css';
import '../video/videoWorkflows.css';
import './threeD.css';
import { QUALITIES, QUALITY_LABEL, QUALITY_HINT, previzQuality, setPrevizQuality, onPrevizQuality } from '../../shared/previz/quality';
import { SlotLabel } from '../../shared/SlotLabel';

type Payload = { workflows: (ThreeDWorkflow & { runnable: boolean; defaults?: { hosted: string | null; local: string | null; why: { local?: string; hosted?: string }; active: { id: string; defaultProvider: string | null; why?: string; reason?: string | null; runs?: boolean } | null } })[];
  models: ThreeDModel[]; showcase: { dataset: { name: string; url: string; credit: string; licence: string; licenceUrl: string }; items: ShowcaseItem[] }; bigGlbBytes: number };
let cache: Promise<Payload | null> | null = null;
const useThreeD = () => { const [p, setP] = useState<Payload | null>(null);
  useEffect(() => { let on = true; cache ??= fetch('/api/3d-workflows').then((r) => (r.ok ? r.json() : null)).catch(() => { cache = null; return null; }); void cache.then((x) => { if (on) setP(x); }); return () => { on = false; }; }, []); return p; };
const TOOL = 'three-d';
/** What a coming-soon workflow points to today (its bar's line, the button's workflow, an optional second way). */
const SOON_TODAY: Record<string, { line: string; go: string; alt?: { label: string; href: string } }> = {
  retexture: { line: 'Today, make a new model with Image to 3D from a picture that has the look you want.', go: 'image-to-3d' },
  rig: { line: 'For people it works today, free: open one of your 3D models and press Rig. Other shapes are coming.', go: 'image-to-3d' },
  default: { line: 'Image to 3D works today: one picture in, a textured model out.', go: 'image-to-3d' },
};
const LBL: Record<string, string> = { low: 'Low', standard: 'Standard', high: 'High', off: 'Off', hd: 'HD', pbr: 'PBR', auto: 'Auto', '10k': '10k', '50k': '50k', '200k': '200k' };
/* recipeFor (the model's settings as a workflow recipe) lives in shared/threeDRecipe.ts: the Canvas bar's 3D card uses it too. */
/** a feed video that failed to open (read the moment its job finished) gets one more try */
const retryVideo = (e: React.SyntheticEvent<HTMLVideoElement>) => { const v = e.currentTarget; if (v.dataset.retried) return; v.dataset.retried = '1'; setTimeout(() => v.load(), 1200); };
const fileFromUrl = async (url: string, name = 'image.png') => { const r = await fetch(url); if (!r.ok) throw new Error('That image could not be loaded.'); const b = await r.blob(); return new File([b], name, { type: b.type || 'image/png' }); };

export default function ThreeDStudio({ tool, tools }: { tool: ToolInfo; tools: ToolInfo[] }) {
  const toast = useToast(); const search = useSearch(); const data = useThreeD(); const bill = useBilling();
  const wf = currentThreeDWorkflow(search); const wfRow = data?.workflows.find((w) => w.id === wf.id); const generation = wf.toolId === TOOL && wf.status === 'ready'; const textMode = wf.id === 'text-to-3d'; const multiMode = wf.id === 'multiview-to-3d';
  useToolModels(TOOL);
  // ---- model + settings (per workflow draft, like Image's) ----
  const def = wfRow?.defaults ?? null; const providers = tool.providers.filter(p => threeDSupportsMode(p.id, wf.mode ?? 'image-to-3d'));
  const defId = [def?.active?.defaultProvider, def?.hosted, 'cloud-tripo-31', providers[0]?.id].find(id => providers.some(p => p.id === id)) ?? '';
  const [drafts, setDrafts] = useState<Record<string, ReturnType<typeof loadDraft>>>({});
  const draft = drafts[wf.id] ?? loadDraft(`3d:${wf.id}`) ?? { prompt: '', provider: '', vals: {} as Record<string, string> };
  const setDraft = (f: (d: typeof draft) => typeof draft) => setDrafts(ds => { const n = f(ds[wf.id] ?? loadDraft(`3d:${wf.id}`) ?? { prompt: '', provider: '', vals: {} }); saveDraft(`3d:${wf.id}`, n); return { ...ds, [wf.id]: n }; });
  const provider = draft.provider && providers.some(p => p.id === draft.provider) ? draft.provider : defId; const model = threeDModel(provider);
  const set = normalizeSettings(provider, draft.vals); const seed = draft.vals.seed ?? '';
  const recipe = useMemo(() => recipeFor(model, wf), [model?.id, wf.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [files, setFiles] = useState<Record<string, WfSlotFile | null>>({}); const img = files.image ?? null;
  const activeFiles = Object.fromEntries(recipe.slots.map(s => [s.name, files[s.name] ?? null]));
  const [sizes, setSizes] = useState<Record<string, { width: number; height: number }>>({}); const imgSize = sizes.image ?? null; const [busyEdge, setBusyEdge] = useState<number | null>(null);
  useEffect(() => { setSizes({}); let on = true; for (const [name, f] of Object.entries(files)) { if (!f) continue; const i = new Image(); i.onload = () => { if (on) setSizes(v => ({ ...v, [name]: { width: i.naturalWidth, height: i.naturalHeight } })); }; i.src = f.url; } return () => { on = false; }; }, [files]);
  useEffect(() => { setBusyEdge(null); if (!img || multiMode || textMode) return; let on = true; void edgeBusyness(img.url).then(b => { if (on) setBusyEdge(b); }); return () => { on = false; }; }, [img?.url, multiMode, textMode]);
  const takeFile = (slot: string, f: File | null) => { if (f && !fileFits('image', f)) { toast(wrongTypeText(f.name, ['image']), 'error'); return; } setFiles(v => ({ ...v, [slot]: f ? { file: f, url: URL.createObjectURL(f) } : null })); };
  const takeImage = (f: File | null) => takeFile('image', f);
  const pickedSlot = useRef('image');
  // Models page "Open in 3D": ?model=<3D model id> picks that model once (Image to 3D's draft keeps it)
  const pickedModel = useRef(''); useEffect(() => { const k = new URLSearchParams(search).get('model'); if (!k || pickedModel.current === k || !tool.providers.some((p) => p.id === k)) return; pickedModel.current = k; setDraft((d) => ({ ...d, provider: k })); }, [search]); // eslint-disable-line react-hooks/exhaustive-deps
  // Send to 3D: ?fromJob=<image job>&out=<n> fills the slot once
  const sent = useRef(''); useEffect(() => { const q = new URLSearchParams(search); const fj = q.get('fromJob'); if (!fj || sent.current === fj) return; sent.current = fj; const out = Number(q.get('out')) || 0;
    void getJob(fj).then((j) => { const u = j.outputs?.[out]?.url ?? j.resultUrl; if (!u || !/\.(png|jpe?g|webp)(\?|$)/i.test(u)) throw new Error('That result isn’t an image.'); return fileFromUrl(u, `from-${fj}.${u.split('.').pop()}`); })
      .then((f) => { takeImage(f); toast('Image added to Image to 3D', 'info'); }).catch((e) => toast((e as Error).message, 'error')); }, [search]); // eslint-disable-line react-hooks/exhaustive-deps
  /* Recreate (2026-10-27): ?recreate=<3D job> (Assets, the viewer, any feed: shared/workflowLinks recreateHref) puts that job's picture, model and
     settings back in Image to 3D, with a new seed; nothing runs until Generate. Read on mount and on every in-app navigation (popstate), so a
     Recreate of the same job twice, or from this page's own viewer, loads again. */
  const takeRef = useRef(takeFile); takeRef.current = takeFile; const draftRef = useRef(setDraft); draftRef.current = setDraft;
  useEffect(() => { let seq = 0;
    const run = () => { const q = new URLSearchParams(location.search); const rc = q.get('recreate'); if (!rc || location.pathname.replace(/\/+$/, '') !== THREE_D_PAGE) return;
      q.delete('recreate'); history.replaceState(history.state, '', location.pathname + (q.toString() ? `?${q}` : '') + location.hash); const my = ++seq;
      void (async () => { try {
        const [pr, j] = await Promise.all([fetch(`/api/jobs/${encodeURIComponent(rc)}/prefill?action=recreate`).then((r) => (r.ok ? r.json() : null)).catch(() => null), getJob(rc)]);
        if (my !== seq) return; if (j.toolId !== TOOL) return; /* a turntable or a mockup: its workflow is open, there is nothing to fill */
        const form: Record<string, string> = pr?.form ?? {}; const inp: any = j.input ?? {}; const prov = String(form.provider ?? (j as any).provider ?? '');
        const v: Record<string, string> = {}; for (const k of ['detail', 'texture', 'faces'] as const) { const x = form[k] ?? inp[k]; if (x != null && x !== '') v[k] = String(x); }
        draftRef.current((d) => ({ ...d, prompt: String(form.prompt ?? inp.prompt ?? ''), provider: prov && tool.providers.some((p) => p.id === prov) ? prov : d.provider, vals: { ...d.vals, ...v, seed: '' } }));
        setFiles({}); const mode = threeDMode(inp);
        if (mode === 'text-to-3d') { toast('Same prompt and settings loaded, with a new seed.', 'info'); return; }
        const slots = mode === 'multiview-to-3d' ? THREE_D_VIEW_SLOTS : [{ name: 'image', label: 'Image' }];
        let missing = false;
        for (const slot of slots) {
          const url: string | undefined = pr?.files?.[slot.name]?.[0] ?? inp[`${slot.name}Url`];
          if (!url) { if (slot.name === 'image') missing = true; continue; }
          const f = await fileFromUrl(url, url.split('/').pop() || `${slot.name}.png`).catch(() => null); if (my !== seq) return;
          if (!f) missing = true; else takeRef.current(slot.name, f);
        }
        toast(missing ? 'Settings loaded. Some pictures are no longer on disk: add them again before you generate.' : 'Same pictures and settings loaded, with a new seed.', missing ? 'warn' : 'info');
      } catch (e) { if (my === seq) toast(`Couldn’t load that result: ${(e as Error).message}`, 'error'); } })(); };
    run(); addEventListener('popstate', run); return () => removeEventListener('popstate', run); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // ---- jobs (three-d + turntables) ----
  const [jobs, setJobs] = useState<JobState[]>([]); const [loaded, setLoaded] = useState(false); const tick = useRef(0);
  const refresh = () => Promise.all([listJobs(TOOL), listJobs('three-d-turntable'), listJobs(PREVIZ_TOOL), listJobs(MAKE_REAL_TOOL)]).then(([a, b, c, d]) => { setJobs([...a, ...b, ...c, ...d].sort((x, y) => (y.createdAt ?? 0) - (x.createdAt ?? 0))); setLoaded(true); }).catch(() => setLoaded(true));
  useEffect(() => { void refresh(); }, []);
  const active = jobs.some((j) => j.status === 'queued' || j.status === 'running');
  useEffect(() => { if (!active) return; const t = setInterval(() => { tick.current++; void refresh(); }, 1200); return () => clearInterval(t); }, [active]);
  const results = jobs.filter((j) => !(j as any).deletedAt);
  /* Render (step 3): the sheet over one recording; the button that opened it is its anchor. The player's button uses the newest recording. */
  const [mir, setMir] = useState<string | null>(null); const mirAnchor = useRef<HTMLElement | null>(null);
  /* the sheet is tall: next to its button when there is room above or below it, else from the top of the page, centred (a small fixed mark) */
  const mirTop = useRef<HTMLSpanElement>(null); const [mirAt, setMirAt] = useState<'el' | 'top'>('el');
  const openMir = (planId: string, el: HTMLElement) => { const r = el.getBoundingClientRect(); const dockTop = dock.current?.getBoundingClientRect().top ?? innerHeight;
    const room = Math.max(r.top - 64, dockTop - r.bottom); const far = room < 600 && !!mirTop.current; setMirAt(far ? 'top' : 'el'); mirAnchor.current = far ? mirTop.current : el; setMir(planId); };
  const [gfx, setGfx] = useState(previzQuality); useEffect(() => onPrevizQuality(setGfx), []);
  const [ps, setPsS] = useState(loadPlan); const shot = ps.shot; const pvView = ps.view; const recMode = ps.rec; const step = ps.step;
  const [imported, setImported] = useState<ImportedScene | null>(null); const [sceneSt, setSceneSt] = useState<SceneStatus | null>(null);
  /* the mockup to render: the newest one of the shot on stage (feed3d mockupForShot), or one you picked yourself from "Use your last mockup" */
  const takeId = chosenTake(shot)?.id ?? null; const newestPlan = results.find((j) => j.toolId === PREVIZ_TOOL && j.status === 'done') ?? null;
  const shotKey = JSON.stringify(shotForJob(shot));
  const [planPick, setPlanPick] = useState(''); useEffect(() => setPlanPick(''), [shotKey, imported]);
  // Imported HTML is held in memory, not identified in historical snapshots: never silently match a different imported file.
  const lastPlan = (planPick ? results.find((j) => j.id === planPick && j.status === 'done') : null) ?? (imported ? null : mockupForShot(results, { template: shot.template, move: shot.move, takeId, imported: false, shot }));
  /* a mockup just recorded is still being saved: the Render step waits for it rather than offering the one before */
  const planSaving = (() => { const n = results.find((j) => j.toolId === PREVIZ_TOOL); return !!n && (n.status === 'queued' || n.status === 'running'); })();
  /* the honest hint on step 3: free, on your computer, and the same time estimate the sheet starts from (its default length and size) */
  const mirHint = (() => { if (!lastPlan) return ''; const pv: any = (lastPlan.input as any)?.previz ?? {}; const a = pv.width && pv.height ? aspectOf(pv.width, pv.height) : '16:9';
    const [w, h] = MAKE_REAL_SIZES[MAKE_REAL_DEFAULT_SIZE].dims[a]; return `Real video from your mockup · Free · on your computer · ${minutesText(makeRealEtaSeconds({ width: w, height: h, frames: MAKE_REAL_DEFAULT_FRAMES }))}`; })();
  /* a Render of the last mockup on its way (painting its first frame in the sheet's pipeline, or the job itself): the player's Render button shows it */
  const mirPipe = useRenderPipe(lastPlan?.id ?? null); const mirJob = ((lastPlan as any)?.madeReal ?? []).find((m: any) => m.status === 'running' || m.status === 'queued') ?? null;
  const mirRunning = mirPipe ? { text: mirPipe.stage === 'painting' ? `Painting the first frame${mirPipe.pct ? ` · ${mirPipe.pct}%` : '…'}` : 'Starting the render…', pct: mirPipe.stage === 'painting' ? mirPipe.pct / 4 : 25, onOpen: () => lastPlan && openMir(lastPlan.id, document.querySelector('[data-testid=pv-make-real-running]') as HTMLElement) }
    : mirJob ? { text: `Rendering${mirJob.progress ? ` · ${mirJob.progress}%` : '…'}`, pct: mirJob.progress ?? 0, onOpen: () => setView({ kind: 'job', id: mirJob.id }) } : null;
  const madeRealDone = !!((lastPlan as any)?.madeReal ?? []).some((m: any) => m.status === 'done');
  /* the feed's kind filter (All · Models · Mockups · Renders; the default follows the workflow: feed3d.ts) */
  const { kinds, setKinds, counts, shownJobs } = useFeedKinds(results, wf.id);
  // ---- quote (= charge) ----
  const qParams = { types: wf.mode ?? 'image-to-3d', detail: set.detail, texture: set.texture, faces: set.faces, picks: threeDPicksParam(draft.vals) /* P3-05: the menu prices each model at its own defaults plus these */, ...Object.fromEntries(Object.entries(activeFiles).filter(([, f]) => !!f).map(([name]) => [name, '1'])) };
  const q = useWorkflowQuote(generation ? TOOL : null, provider, qParams);
  const tm = modelOfEngine(TOOL, provider); const ro = runOnText(tm, useRunOn(TOOL, tm?.key).runOn, q);
  const credits: number | null = q ? shownCredits(q) : null; const unpricedWhy = unpricedReason(q); const gate = !!q && q.needsKey === true && q.runnable === false;
  const blockWhy = !gate && !unpricedWhy && q?.runnable === false ? String(runBlock(q) ?? q?.reason ?? '') : '';
  const isDemo = !unpricedWhy && !blockWhy && credits != null && q?.demo === true; const isFree = credits === 0 && q?.routeKind === 'local';
  const modelName = (tm ? shownName(tm) : null) ?? model?.name ?? provider; const modelPriceNote = threeDPriceNote(provider, wf.mode ?? undefined);
  const typSec = model?.typicalSec ?? 90; /* estimated: no provider publishes a 3D run time */
  // ---- pre-flight: inputs → model → setup → money (shared list and words) ----
  const viewIssue = multiMode ? threeDViewIssue(Object.keys(activeFiles).filter(k => !!activeFiles[k])) : null;
  const pf = preflightProblems({ freeLocal: hasFreeLocal(TOOL), slots: recipe.slots.map(s => ({ name: s.name, label: s.label, required: s.required || (s.name === 'image_left' && !Object.keys(activeFiles).some(k => k !== 'image' && activeFiles[k])), filled: !!activeFiles[s.name], missing: s.missing, width: sizes[s.name]?.width ?? null, height: sizes[s.name]?.height ?? null })), prompt: textMode && !draft.prompt.trim() ? { missing: 'Write a prompt' } : null, minSide: 128, quote: q, modelName });
  const [pfOpen, setPfOpen] = useState(false); const genRef = useRef<HTMLButtonElement>(null); const dock = useRef<HTMLDivElement>(null);
  type Note = { key: string; stage: string; node: ReactNode; hard?: boolean };
  const notes: Note[] = pf.map((p, i) => ({ key: `pf-${i}`, stage: p.stage[0].toUpperCase() + p.stage.slice(1), hard: true, node: <span data-testid={`t3-pf-${p.code}`}>{p.message}</span> }));
  if (gate && !pf.some((p) => p.code === 'needs_key')) notes.push({ key: 'gate', stage: 'Setup', hard: true, node: <KeyNeeded q={q} className="vs-key" toolId={TOOL} /> });
  if (blockWhy && !pf.some((p) => p.stage === 'model')) notes.push({ key: 'block', stage: 'Model', hard: true, node: <span>{blockWhy}</span> });
  if (img && busyEdge != null && busyEdge > 0.35) notes.push({ key: 'bg', stage: 'Inputs', node: <span data-testid="t3-bg-note">The background looks busy. A plain one makes a cleaner model: <button type="button" className="fd-link" onClick={() => void removeBg()}>Remove background</button></span> });
  const blocking = notes.some((n) => n.hard);
  useEffect(() => { if (pfOpen && !notes.length) setPfOpen(false); });
  const inputMissing = textMode ? (!draft.prompt.trim() ? 'Write a prompt' : '') : multiMode ? (viewIssue ? (img ? 'Add one more view' : 'Add the front view') : '') : !img ? 'Add an image' : '';
  const genWord = inputMissing || (gate ? (q?.setup?.action === 'add_key' && q.setup.actionText ? String(q.setup.actionText) : (q?.keyOwner ? addKeyText(q) : 'Add a key first')) : pf[0] ? (PF_SHORT[pf[0].code]?.(pf[0]) ?? pf[0].message) : unpricedWhy ? 'Price unavailable' : blockWhy ? 'Pick another model' : '');
  /* Missing inputs do not change this flat per-model price; show the quote with a short next step. */
  const priceFirst = !!inputMissing && !gate && !unpricedWhy && !blockWhy && credits != null && pf.every((p) => p.stage === 'inputs');
  // ---- run ----
  const [busy, setBusy] = useState(false);
  const generate = async () => { if (inputMissing || blocking) return; setBusy(true); setPfOpen(false);
    const fd = new FormData(); fd.append('types', JSON.stringify([wf.mode])); fd.append('provider', provider); for (const k of ['detail', 'texture', 'faces'] as const) fd.append(k, set[k]); fd.append('format', 'glb'); if (seed) fd.append('seed', seed); if (textMode) fd.append('prompt', draft.prompt.trim()); for (const [name, file] of Object.entries(activeFiles)) if (file) fd.append(name, file.file, file.file.name || `${name}.png`);
    try { const r = await createJob(TOOL, fd, { showsIssues: true }); toast(r.cost ? `Started: ${modelName}` : `Started: ${modelName}`, 'info'); await refresh(); }
    catch (e) { const iss = issuesOf(e); toast(iss[0]?.message ?? (e as Error).message, 'error'); } finally { setBusy(false); } };
  // Remove background first (the existing Remove Background tool; its own price, shown on the button)
  const [rbBusy, setRbBusy] = useState(false); const [rbQ, setRbQ] = useState<any>(null);
  useEffect(() => { if (!img) return; void fetch('/api/tools/app-remove-bg/price?image=1').then((r) => (r.ok ? r.json() : null)).then(setRbQ).catch(() => 0); }, [!!img]); // eslint-disable-line react-hooks/exhaustive-deps
  const removeBg = async () => { if (!img || rbBusy) return; setRbBusy(true);
    try { const fd = new FormData(); fd.append('image', img.file, img.file.name || 'image.png'); const r = await createJob('app-remove-bg', fd);
      let j = await getJob(r.id); for (let k = 0; k < 120 && (j.status === 'queued' || j.status === 'running'); k++) { await new Promise((ok) => setTimeout(ok, 1000)); j = await getJob(r.id); }
      if (j.status !== 'done' || !j.resultUrl) throw new Error(j.error ?? 'The background could not be removed.');
      takeImage(await fileFromUrl(j.resultUrl, `cutout-${r.id}.png`)); toast('Background removed', 'info');
    } catch (e) { toast((e as Error).message, 'error'); } finally { setRbBusy(false); } };
  // ---- the model menu (shared ModelMenu, Default badge) ----
  const chipsEl = useRef<HTMLDivElement>(null); const folded = useChipFit(chipsEl); const fo = (k: string) => folded.includes(k);
  const [pop, setPop] = useState(() => (wantsPicker() ? 'wf' : '')); usePickerParam((o) => setPop(o ? 'wf' : '')); const mRef = useRef<HTMLButtonElement>(null); const wfRef = useRef<HTMLButtonElement>(null); const setRef = useRef<HTMLButtonElement>(null); const fileIn = useRef<HTMLInputElement>(null);
  const items: MenuItem[] = providers.map((x) => { const m = threeDModel(x.id); return { id: x.id, name: m?.name ?? x.name, open: x.kind === 'open-weights' || isOpenWeights(x, null), tag: threeDPriceNote(x.id, wf.mode ?? undefined), off: m?.download ? `it isn’t added yet (${(m.download.bytes / 1e9).toFixed(1)} GB of files).` : null, p: x }; });
  // ---- viewer ----
  const done3d = results.filter((j) => j.status === 'done' && jobIs3d(j));
  /* the open item is ?view=<job id> or ?view=ex-<example id> (the shared useFeedViewer, like Image and Video): Back closes it, a reload reopens it */
  const { view, setView, viewJob, viewNav } = useView3d(done3d, data, loaded);
  const viewItem: Item3D | null = !view || !data || view.kind !== 'ex' ? null : exItem(data, view.i);
  /* an example's "Use this image": its input picture into Image to 3D's slot, with the example's model when this app has it (nothing runs) */
  const useExampleImage = async (i: number) => { const s0 = data?.showcase.items[i]; if (!s0) return;
    try { const f = await fileFromUrl(s0.input, `example-${s0.id}.${(s0.input.split('?')[0].split('.').pop() || 'png').toLowerCase()}`); takeImage(f);
      /* a coming-soon local model (Pixal3D: listed with its files, no runner; the model menu greys it out too) can't run: the default model stays picked */
      const m0 = exampleModel(s0.model, data?.models ?? []); const m = m0 && tool.providers.some((p) => p.id === m0.id) && !threeDModel(m0.id)?.download ? m0 : null; if (m) setDraft((d) => ({ ...d, provider: m.id }));
      goToWorkflow(THREE_D_PAGE, () => setView(null)); toast(m ? `Image added to Image to 3D, with ${m.name}` : `Image added to Image to 3D, with the default model. The example was made with ${s0.model}.`, 'info');
    } catch (e) { toast((e as Error).message, 'error'); } };
  // ---- turntable workflow: which 3D result to record ----
  const [ttPick, setTtPick] = useState(''); const ttJob = done3d.find((j) => j.id === ttPick) ?? done3d[0] ?? null; const ttRef = useRef<HTMLButtonElement>(null);
  const isTT = wf.id === 'turntable'; const isPS = wf.id === 'plan-a-shot';
  /* a coming-soon workflow opened by a link (?workflow=text-to-3d): the bar says so and offers what works today, never Image to 3D's controls (2026-10-27) */
  const isSoon = wf.status === 'soon'; const soonAlt = isSoon ? SOON_TODAY[wf.id] ?? SOON_TODAY.default : null; const noModel = isTT || isPS || isSoon;
  /* each Shape / Mesh detail / Texture option shows only what it changes ('+$0.20'; nothing when it costs the same, nothing on the picked one): the
     total stays on Generate (2026-11-01). One variant request (shared/optionPrice.ts); a sample run (mock) compares list prices, said in the tooltip. */
  const own = ((m) => (m == null ? null : m === 'own-accounts'))(modeOf(bill, q));
  const optVariants: Record<string, Overrides> = {}; if (model && !noModel) for (const f of ['detail', 'texture', 'faces'] as const) for (const o of model[f] ?? []) optVariants[`${f}:${o.value}`] = { [f]: o.value };
  const vq = useVariantQuotes(model && !noModel ? TOOL : null, model && !noModel ? { ...qParams, provider } : null, optVariants);
  const optPrice = (f: string, v: string): string | null | undefined => { if (!q || set[f as 'detail'] === v) return null; const x = vq.get(`${f}:${v}`);
    return x === undefined ? undefined : !x || (typeof x.status === 'number' && x.status >= 400) ? null : optionDelta(q, x, own); };
  // ---- Direct a Shot: the one shot object (PlanShot), the view, what to record, an imported scene, the recording ----
  const setPs = (f: (p: PlanState) => PlanState) => setPsS((p) => { const n = f(p); savePlan(n); return n; });
  const setStep = (st: PlanStep) => { setPop(''); setPs((p) => ({ ...p, step: st })); };
  const setShot = (patch: Partial<PlanShot>) => setPs((p) => ({ ...p, shot: normalizePlanShot({ ...p.shot, ...patch }) }));
  /* the player edits the same shot (flown takes, map drags) */ const editShot = (f: (s: PlanShot) => PlanShot) => setPs((p) => ({ ...p, shot: normalizePlanShot(f(p.shot)) }));
  /* a flown take belongs to the set it was flown in: switching preset asks first, then clears the takes (and the map drags) */
  const pickPreset = async (id: PrevizTemplateId) => { setPop('');
    const n = shot.cameraPath?.takes.length ?? 0; const same = !imported && id === shot.template;
    if (n && !same && !(await askConfirm({ title: 'Switch scene?', body: [`Your ${n === 1 ? 'flown take was' : `${n} flown takes were`} made in ${tplNow.name}. They won’t fit another set, so switching clears ${n === 1 ? 'it' : 'them'}.`], confirm: `Switch and clear ${n === 1 ? 'the take' : 'takes'}`, cancel: `Keep ${tplNow.name}` }))) return;
    setImported(null); setSceneSt(null); setPs((p) => { if (same) return p; const base = { ...defaultPlanShot(id), seed: p.shot.seed, note: p.shot.note }; const models = carryModels(p.shot.models, id, actorStart(base)); /* your 3D models come along, re-placed for the new set */
      return { ...p, shot: models ? { ...base, models } : base }; }); };
  const effShot: PlanShot = imported && sceneSt?.state === 'ready' ? { ...shot, seconds: clampSeconds(sceneSt.check.duration) } : shot;
  const player = useRef<PrevizHandle>(null); const htmlIn = useRef<HTMLInputElement>(null); const presetRef = useRef<HTMLButtonElement>(null);
  const [recording, setRecording] = useState<CaptureProgress | null>(null); const [saving, setSaving] = useState(false); const recAbort = useRef<AbortController | null>(null);
  const [playerBlock, setPlayerBlock] = useState('Wait for the scene to be ready');
  const [takeReady, setTakeReady] = useState<ReadyTake | null>(null);
  // Keep completed frames after a rejected save: retrying this free local upload never starts a provider render.
  const pendingSave = useRef<{ shot: PlanShot; rec: CaptureResult; scene: 'preset' | 'imported' } | null>(null);
  const [saveError, setSaveError] = useState('');
  const keepMockup = async () => { const p = pendingSave.current; if (!p) return; setRecording(null); setSaving(true);
    try { const id = await savePlanShot(p.shot, p.rec, p.scene); pendingSave.current = null; setSaveError(''); await refresh(); setPlanPick(id); setPs((s) => ({ ...s, step: 'render' })); toast('Mockup saved. Next: Render video. No provider run has started.', 'info'); }
    catch (e) { const why = issuesOf(e)[0]?.message ?? (e as Error).message; setSaveError(why); toast(`Couldn’t save the mockup: ${why}. Your takes are unchanged.`, 'error'); }
    finally { setSaving(false); } };
  const tplNow = previzTemplate(shot.template)!;
  /* ?preset=<template> (an example's Try this) opens that preset; ?realPrompt= waits in the Render sheet (MIR_PROMPT_KEY). Nothing runs. */
  const linked = useRef(''); useEffect(() => { const q = new URLSearchParams(search); const pre = q.get('preset'); const rp = q.get('realPrompt'); const key = `${pre}|${rp}`;
    if (!isPS || (!pre && !rp) || linked.current === key) return; linked.current = key;
    if (rp) { try { sessionStorage.setItem(MIR_PROMPT_KEY, rp.slice(0, 1200)); } catch { /* private mode: the sheet starts from its own prompt */ } }
    const t = pre ? previzTemplate(pre) : null; if (t) void pickPreset(t.id);
    toast(rp ? `${t?.name ?? 'Direct a Shot'} is ready. Record a mockup, then Render: its prompt is filled in.` : `${t?.name ?? 'Your scene'} is ready to record.`, 'info'); }, [search, isPS]); // eslint-disable-line react-hooks/exhaustive-deps
  /* Use in Direct a Shot (a 3D result's action, ?useModel=<3D job>): the stage step, our own set (an imported scene can't hold a model), then the
     player places the model; the link is then taken off the address, so Back and a reload don't place it twice */
  const useModelQ = isPS ? new URLSearchParams(search).get('useModel') : null;
  useEffect(() => { if (!useModelQ) return; if (imported) { setImported(null); setSceneSt(null); } if (step !== 'stage') setStep('stage'); }, [useModelQ]); // eslint-disable-line react-hooks/exhaustive-deps
  const usedModel = () => { const q = new URLSearchParams(location.search); if (!q.has('useModel')) return; q.delete('useModel'); navigate(`${location.pathname}?${q}`, { replace: true }); };
  const copyPrompt = async () => { try { await navigator.clipboard.writeText(buildPromptFor(shot)); toast(`Build prompt copied: ${tplNow.name}. Paste it into your coding agent, then import the page it makes.`, 'info'); } catch { toast('The prompt could not be copied here. Allow clipboard access and try again.', 'error'); } };
  const takeHtml = async (f: File | null) => { if (!f) return; const text = f.size > SCENE_HTML_MAX_BYTES ? '' : await f.text().catch(() => '');
    const probs = checkSceneHtml(text, f.size); if (!/\.html?$/i.test(f.name) && !/html/.test(f.type)) probs.unshift('Pick an .html file.');
    if (probs.length) { toast(probs[0], 'error'); return; } setSceneSt(null); setImported({ name: f.name, html: text }); setPop(''); };
  const record = async () => {
    if (psBusy) return; const src = player.current?.source(); if (!src) { toast(imported ? 'The imported scene isn’t ready yet.' : 'The scene is still setting up. Try again in a moment.', 'error'); return; }
    pendingSave.current = null; setSaveError('');
    const passes: PrevizPass[] = recMode === 'clay-depth' ? ['clay', 'depth'] : [pvView]; const ac = new AbortController(); recAbort.current = ac; setPop('');
    setRecording({ done: 0, total: 1, pass: passes[0], frame: 0, frames: 0 }); let last = 0;
    try { const rec = await captureShot(src, effShot, passes, { signal: ac.signal, onProgress: (p) => { const now = performance.now(); if (now - last > 80 || p.done === p.total) { last = now; setRecording(p); } } });
      if (ac.signal.aborted) throw new DOMException('Recording stopped.', 'AbortError');
      pendingSave.current = { shot: effShot, rec, scene: imported ? 'imported' : 'preset' }; await keepMockup();
    } catch (e) { const why = issuesOf(e)[0]?.message ?? (e as Error).message; toast((e as Error).name === 'AbortError' ? 'Recording stopped. Nothing was saved.' : why, (e as Error).name === 'AbortError' ? 'info' : 'error'); }
    finally { setRecording(null); setSaving(false); recAbort.current = null; } };
  const psBusy = !!recording || saving;
  /* the single floating bar (2026-10-26): the player puts its step parts into these two slots of the dock */
  const [slotMain, setSlotMain] = useState<HTMLElement | null>(null); const [slotChips, setSlotChips] = useState<HTMLElement | null>(null);
  const camRef = useRef<HTMLButtonElement>(null); const colRef = useRef<HTMLButtonElement>(null); const moreRef = useRef<HTMLButtonElement>(null);
  const viewAllowed: PrevizPass[] = imported && sceneSt?.state === 'ready' ? sceneSt.check.passes : PREVIZ_PASSES.map((p) => p.id);
  /* leaving Direct a Shot (another workflow, another page) stops a recording: its 3D view is gone, nothing half-drawn is saved */
  useEffect(() => { if (!isPS) recAbort.current?.abort(); }, [isPS]);
  useEffect(() => () => recAbort.current?.abort(), []);
  const psBlock = imported && sceneSt?.state !== 'ready' ? (sceneSt?.state === 'error' ? 'Fix the scene first' : 'Opening the scene…') : playerBlock;
  const flown = chosenTake(shot);
  const planPanels = { camera: <>{flown && <p className="bp-fact ps-flown" data-testid="ps-flown">{flown.name}, the move you flew, drives the camera now. Pick a move here to go back to a preset move; your takes stay in the Mockup step.</p>}<PopSection label="Camera move"><Segmented label="Camera move" value={flown ? ('' as any) : shot.move} cols={2} testId="ps-move" onChange={(v) => setShot({ move: v, ...(shot.cameraPath ? { cameraPath: { ...shot.cameraPath, chosen: null } } : {}) })} options={PREVIZ_MOVES.map((m) => ({ value: m.id, label: m.label, hint: m.hint, testId: `ps-move-${m.id}` }))} /></PopSection>
        <PopSection label="Speed"><Segmented label="Speed" value={shot.speed} testId="ps-speed" onChange={(v) => setShot({ speed: v })} options={PREVIZ_SPEEDS.map((x) => ({ value: x.id, label: x.label, testId: `ps-speed-${x.id}` }))} /></PopSection></>,
    frame: <><PopSection label="Shape"><Segmented label="Shape" value={shot.aspect} testId="ps-aspect" onChange={(v) => setShot({ aspect: v })} options={PREVIZ_ASPECTS.map((a) => { const [w, h] = aspectWH(a)!; return { value: a, label: a, hint: ASPECT_HINT[a], icon: <AspectShape w={w} h={h} />, testId: `ps-aspect-${a.replace(':', 'x')}` }; })} /></PopSection>
        {imported ? <p className="bp-fact">Length: {effShot.seconds} s, set by the scene.</p> : <PopSection label="Length" aside={<span className="bp-mono" data-testid="ps-len-v">{shot.seconds} s</span>}><input className="ps-range" type="range" min={PREVIZ_MIN_SECONDS} max={PREVIZ_MAX_SECONDS} step={1} value={shot.seconds} aria-label="Length in seconds" data-testid="ps-len" onChange={(e) => setShot({ seconds: Number(e.target.value) })} /><span className="ps-range-l"><small>{PREVIZ_MIN_SECONDS} s</small><small>{PREVIZ_MAX_SECONDS} s</small></span></PopSection>}
        <PopSection label="Frame rate" aside="frames per second"><Segmented label="Frame rate" value={shot.fps} testId="ps-fps" onChange={(v) => setShot({ fps: v })} options={PREVIZ_FPS.map((f) => ({ value: f, label: `${f} fps`, hint: f === 24 ? 'Film look (what video models like best)' : 'A little smoother motion', testId: `ps-fps-${f}` }))} /></PopSection></>,
    colour: <><PopSection label={tplNow.subjectLabel}><span className="ps-swatches" role="radiogroup" aria-label={tplNow.subjectLabel}>{PREVIZ_COLOURS.map((c) => <button key={c.id} type="button" role="radio" aria-checked={shot.colour === c.id} className={shot.colour === c.id ? 'on' : ''} data-testid={`ps-colour-${c.id}`} onClick={() => setShot({ colour: c.id })} {...tip(c.label)}><i style={{ background: c.hex }} aria-hidden /><span>{c.label}</span></button>)}</span></PopSection></>,
    record: <><PopSection label="Record"><Segmented label="Record" value={recMode} testId="ps-rec" onChange={(v) => setPs((p) => ({ ...p, rec: v }))} options={[{ value: 'view', label: 'The preview style you see', hint: `${PREVIZ_PASSES.find((p) => p.id === pvView)?.label} style, one video`, testId: 'ps-rec-view' }, { value: 'clay-depth', label: 'Clay + Depth', hint: 'Two videos, ready for the Render step', testId: 'ps-rec-clay-depth' }]} /></PopSection>
        <p className="bp-fact">Free. Your browser draws every frame exactly, then this computer saves an MP4.</p></> };
  const planSummaries = { camera: flown ? `${flown.name} · flown` : `${PREVIZ_MOVES.find((m) => m.id === shot.move)?.label} · ${PREVIZ_SPEEDS.find((x) => x.id === shot.speed)?.label}`, frame: `${effShot.aspect} · ${effShot.seconds} s${effShot.fps === 24 ? '' :` · ${effShot.fps} fps`}` /* 24 fps is the default: the chip says fps only when it changes */,
    colour: colourOf(shot.colour).label, record: recMode === 'clay-depth' ? 'Clay + Depth' : `${PREVIZ_PASSES.find((p) => p.id === pvView)?.label} style` };
  const pick = (id: string) => navigate(id === 'image-to-3d' ? THREE_D_PAGE : threeDRoute(id));
  const peekForm: PeekForm | null = isTT ? null : { toolId: TOOL, fields: { types: JSON.stringify([wf.mode]), ...(textMode ? { prompt: draft.prompt.trim() } : {}), provider, detail: set.detail, texture: set.texture, faces: set.faces, format: 'glb', ...(seed ? { seed } : {}) }, files: Object.fromEntries(Object.entries(activeFiles).filter(([, f]) => !!f).map(([name]) => [name, 1])), photo: textMode ? null : imgSize };
  const showcase = data?.showcase;
  /* the scene picker (shared/SceneGrid.tsx): our presets with their thumbnails drawn in the browser, your own scene, and room for the 3D sets */
  const thumb = useSceneThumbs(); const sceneAnchor = useRef<HTMLElement | null>(null);
  const sceneItems: SceneItem[] = [
    ...PREVIZ_TEMPLATES.map((t): SceneItem => ({ id: t.id, name: t.name, line: t.tagline, thumb: thumb(t.id), tint: colourOf(t.defaults.colour).hex, icon: <PrevizIcon size={26} />, group: 'presets', testId: `ps-preset-${t.id}`,
      meta: [PREVIZ_MOVES.find((m) => m.id === t.defaults.move)?.label ?? '', `${t.defaults.seconds} s`, t.defaults.aspect].filter(Boolean) })),
    { id: 'import', name: 'Import a scene', line: 'An .html scene your coding agent wrote that follows our scene contract', icon: <UploadIcon size={20} />, action: true, group: 'own', testId: 'ps-import' },
    { id: 'copy', name: 'Copy build prompt', line: `For your agent: a richer “${tplNow.name}” scene, ready to import`, icon: <DocsIcon size={20} />, action: true, group: 'own', testId: 'ps-copy-prompt' },
    { id: 'sets', name: 'Sets & characters', line: 'Real 3D places and rigged characters to shoot with', icon: <CharacterSheetIcon size={20} />, badge: 'Soon', soon: true, action: true, group: 'own', testId: 'ps-sets-soon' },
  ];
  const pickScene = (it: SceneItem) => { if (it.id === 'import') { htmlIn.current?.click(); return; } if (it.id === 'copy') { setPop(''); void copyPrompt(); return; } if (PREVIZ_TEMPLATES.some((t) => t.id === it.id)) void pickPreset(it.id as PrevizTemplateId); };
  const startItems: SceneItem[] = [
    { id: 'plan-a-shot', name: 'Direct a Shot', line: 'Stage a scene, move the camera, and turn it into real video.', thumb: thumb('diorama') ?? thumb('walk-by'), tint: '#FF7A1A', icon: <PrevizIcon size={34} />, badge: 'Free', meta: ['In your browser', 'Then LTX-2.5'], testId: 't3-start-plan' },
    { id: 'image-to-3d', name: 'Image to 3D', line: 'One picture in, a textured model out: orbit it, download the GLB, or film it.', thumb: showcase?.items[0]?.preview ?? null, tint: '#5b8def', icon: <ImageIcon size={34} />, meta: [modelName, 'GLB'], testId: 't3-start-image' },
    { id: 'turntable', name: 'Turntable video', line: done3d.length ? 'Spin one of your models once and keep it as a video.' : 'Spin a model once and keep it as a video. Make a model first.', thumb: showcase?.items[1]?.preview ?? null, tint: '#2fbf8f', icon: <OrbitIcon size={34} />, badge: done3d.length ? 'Free' : undefined, disabled: !done3d.length, meta: ['6 s', 'MP4'], testId: 't3-start-turntable' },
  ];
  useDockHeight(dock, '.vs'); /* the dock height feeds the page's bottom padding (shared with Image, Video and Audio) */

  /* the shared workflow chip (shared/WorkflowChip.tsx), the same as Image's, Video's and Audio's */
  const chip = <WorkflowChip name={wf.name} icon={<WfIcon name={wf.icon} />} title={`${wf.name}: ${wf.tagline}. Change workflow`} picked={wf.id !== 'image-to-3d'} backTo="Image to 3D"
    open={pop === 'wf'} onOpen={() => setPop(pop === 'wf' ? '' : 'wf')} onClear={() => pick('image-to-3d')} chipRef={wfRef} testId="t3-wf-chip" clearTestId="t3-wf-clear" wrapTestId="t3-wf-chip-wrap" />;

  return <div className="vs vs-dk t3" data-testid="three-d-studio">
    <section className="vs-main" aria-label={isPS ? 'Direct a Shot' : 'Your 3D models'}>
      {isPS && <PrevizPlayer ref={player} shot={effShot} view={pvView} step={step} onStep={setStep} slots={{ main: slotMain, chips: slotChips }} useModel={useModelQ} onUsedModel={usedModel}
        topRight={<button ref={moreRef} type="button" className={`pv-glass pv-sq${pop === 'more' ? ' on' : ''}`} aria-label="More: preview style, shape and length, layout" aria-haspopup="dialog" aria-expanded={pop === 'more'} data-testid="ps-more" onClick={() => setPop(pop === 'more' ? '' : 'more')} {...tip(pop === 'more' ? null : 'Preview style, shape and length, what to record, layout')}><MoreIcon size={15} /></button>}
        imported={imported} onImportStatus={setSceneSt} onRecordBlock={setPlayerBlock} onTakeReady={setTakeReady} recording={recording} saving={saving}
        onCopyPrompt={() => void copyPrompt()} onCancel={() => recAbort.current?.abort()} makeReal={lastPlan ? { onOpen: (el) => openMir(lastPlan.id, el), label: (lastPlan.input as any)?.previz?.presetName ?? 'your last recording', hint: mirHint, running: mirRunning } : null} onEditShot={imported ? undefined : editShot}
        progress={{ recorded: !!lastPlan, real: madeRealDone }} onPickScene={(el) => { sceneAnchor.current = el; setPop(pop === 'preset' ? '' : 'preset'); }} errorActions={<button type="button" className="pv-btn" onClick={() => htmlIn.current?.click()}><UploadIcon size={14} />Choose another file</button>} />}
      {!loaded ? null : isPS && !results.length ? null : !results.length ? <div className="t3-empty" data-testid="t3-empty">
          <header className="t3-hero"><h1>Make something in 3D</h1><p>Direct a camera move in a simple 3D scene, or turn one picture into a model you can spin, download and film. Pick a way in:</p></header>
          <SceneGrid label="Ways to start" testId="t3-start" size="lg" min={320} items={startItems} value={wf.id === 'image-to-3d' ? 'image-to-3d' : null} onPick={(it) => { if (it.id === 'image-to-3d') fileIn.current?.click(); else pick(it.id); }} />
          {showcase && <Showcase sc={showcase} models={data?.models ?? []} onOpen={(i, el) => setView({ kind: 'ex', i }, el)} />}</div>
        : <div className="vs-hist t3-hist" data-testid="t3-feed"><FeedH1>3D</FeedH1>
          <div className="t3-feedbar" role="toolbar" aria-label="Your 3D results">
            <h2 className="t3-feed-h">Your 3D work<small data-testid="t3-count">{results.length.toLocaleString()}</small></h2>
            {(['3d', 'preview', 'real'] as FeedKind[]).filter((k) => counts[k] > 0).length > 1 && <span className="t3-kinds" role="group" aria-label="Show">{KINDS.filter((k) => k.id === 'all' || counts[k.id] > 0).map((k) => { const on = k.id === 'all' ? !kinds : !!kinds?.includes(k.id);
              return <button key={k.id} type="button" aria-pressed={on} className={on ? 'on' : ''} data-testid={`t3-kind-${k.id}`} onClick={() => setKinds(k.id === 'all' ? 'all' : [k.id])}>{k.label}<small>{k.id === 'all' ? results.length : counts[k.id]}</small></button>; })}</span>}
            <span className="t3-feedbar-r"><QueueLine className="vs-hist-q" /></span></div>
          <>
          <div className="vs-hgrid t3-grid">{shownJobs.slice(0, 60).map((j) => <Card key={j.id} j={j} own={ownAccountsNow()} onMakeReal={(el) => openMir(j.toolId === MAKE_REAL_TOOL ? (j.input as any)?.makeReal?.planJobId ?? j.id : j.id, el)} onOpen={(el) => setView({ kind: 'job', id: j.id }, el)} onVideo={() => setView({ kind: 'job', id: j.id, record: true })}
            onRetry={async () => { try { await retryJob(j.id); await refresh(); } catch (e) { toast((e as Error).message, 'error'); } }} />)}</div>
          {shownJobs.length > 60 && <p className="t3-more">Showing the newest 60. All {shownJobs.length} are in <a href="/assets" onClick={(e) => { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); navigate('/assets'); }}>Assets</a>.</p>}
          <PosterMaker jobs={done3d} paused={!!view} onSaved={() => void refresh()} />
          {/* the image-to-3D showcase stays visible once you have your own work (user, 2026-10-26) */}
          {showcase && <Showcase sc={showcase} models={data?.models ?? []} onOpen={(i, el) => setView({ kind: 'ex', i }, el)} />}</></div>}
    </section>
    <span ref={mirTop} className="t3-mir-at" aria-hidden />
    <MakeItRealSheet open={!!mir} planJobId={mir} anchor={mirAnchor} avoid={dock} onClose={() => setMir(null)} onStarted={() => void refresh()} placement={mirAt === 'top' ? 'bottom' : 'top'} align={mirAt === 'top' ? 'center' : 'start'} />
    {viewJob && <ResultView job={viewJob} variant="viewer" beforeUrl={viewJob.resultUrl ?? ''} title="Your 3D model" tools={tools} onClose={() => { setView(null); void refresh(); }} onPrev={viewNav.onPrev} onNext={viewNav.onNext} pos={viewNav.pos}
      view3d={{ recordOnOpen: view?.kind === 'job' && !!view.record, onTurntable: () => void refresh(), bigBytes: data?.bigGlbBytes }} />}
    {viewItem && view?.kind === 'ex' && showcase && <Viewer3D item={viewItem} bigBytes={data?.bigGlbBytes} onClose={() => setView(null)} pos={`${view.i + 1} of ${showcase.items.length}`}
      onPrev={view.i > 0 ? () => setView({ kind: 'ex', i: view.i - 1 }) : null} onNext={view.i < showcase.items.length - 1 ? () => setView({ kind: 'ex', i: view.i + 1 }) : null}
      primary={<button type="button" className="rvx-primary" data-testid="v3d-use-image" onClick={() => void useExampleImage(view.i)} {...tip('Put this example’s picture in Image to 3D. Nothing runs until you press Generate.')}><ImageIcon size={16} />Use this image</button>} />}

    <div className="ic ic2 vs-icd"><div className={`ic-dock vs-dock t3-dock${isPS ? ' t3-direct' : ''}${isPS && psBusy ? ' ps-locked' : ''}`} data-testid="t3-dock" ref={dock} aria-busy={isPS && psBusy ? true : undefined}
      onDragOver={(e) => { if (!isTT && !isSoon && Array.from(e.dataTransfer.types).includes('Files')) e.preventDefault(); }} onDrop={(e) => { if (isTT || isSoon) return; if (isPS) { const h = Array.from(e.dataTransfer.files).find((x) => /\.html?$/i.test(x.name)); if (h) { e.preventDefault(); void takeHtml(h); } return; } const f = e.dataTransfer.files[0]; if (!f) return; e.preventDefault(); takeImage(f); }}>
      <div className="ic-frame"><div className="ic-panel"><div className="ic-main">
        {isPS && takeReady && <p className="ps-finish-note" role="status" data-testid="ps-take-ready"><b>{takeReady.name} saved.</b> Take data, not a video yet. {takeReady.performance ? 'Use its follow camera below, or Shoot it for another angle.' : 'Use this take below to make a free mockup MP4.'}</p>}
        {isPS && saveError && <div className="ps-save-error" role="alert" data-testid="ps-save-error"><span><b>Mockup not saved.</b> {saveError} Your takes are unchanged. Retry saves the original captured mockup; frames stay here until you leave or record again.</span><button type="button" className="fd-link" disabled={psBusy || !!playerBlock} {...tip(playerBlock || 'Save the completed frames again. Free; no provider run.')} onClick={() => void keepMockup()} data-testid="ps-retry-save">Retry save · free</button></div>}
        <div className="ic-prow" data-testid="t3-prow">
          {!isPS && !isSoon && !textMode && <div className="ic-lead" data-testid="t3-lead">
            {isPS ? null
            : isTT ? <span className="wf-strip wf-inputs"><button ref={ttRef} type="button" className={`wf-slot${ttJob ? ' full' : ' req'}`} data-testid="t3-tt-slot" aria-haspopup="listbox" aria-expanded={pop === 'tt'} onClick={() => setPop(pop === 'tt' ? '' : 'tt')} {...tip(ttJob ? 'Pick another 3D result' : 'Make a 3D model first')} disabled={!done3d.length}>
                <span className="wf-slot-hit">{ttJob && posterOf3d(ttJob) ? <img src={posterOf3d(ttJob)!} alt="" /> : <CubeIcon size={14} />}{ttJob ? <b>Model</b> : <SlotLabel text="No model yet" />}</span></button></span>
              : <WorkflowInputs recipe={recipe} files={activeFiles} setFile={takeFile} onPick={slot => { pickedSlot.current = slot; fileIn.current?.click(); }} picking={null} onUrl={(slot, u) => { void fileFromUrl(u).then(f => takeFile(slot, f)).catch((e) => toast((e as Error).message, 'error')); }} flash={null} choose={null} onChoose={() => 0} onChooseCancel={() => 0} disabled={busy || rbBusy}
                surface={img && !multiMode && !textMode ? <button type="button" className="ic-chip t3-rmbg" data-testid="t3-remove-bg" disabled={rbBusy} onClick={() => void removeBg()} {...tip(`Cut out the subject first with Remove Background${rbQ ? ` · ${rbQ.demo ? 'sample here' : shownCredits(rbQ) === 0 ? 'free' : `≈ $${((rbQ.credits ?? 0) / 100).toFixed(2)}`}` : ''}`)}>{rbBusy ? <i className="as-spin" aria-hidden /> : null}Remove background</button> : null} />}
          </div>}
          {isPS ? (step === 'stage' ? <textarea className="ic-prompt prompt-field ps-note" rows={1} aria-label="Describe your shot" data-testid="ps-note" maxLength={600} placeholder={imported ? 'Describe your shot (kept with the video)' : `Describe your shot: ${tplNow.tagline.toLowerCase()}…`} value={shot.note} readOnly={psBusy} onChange={(e) => setShot({ note: e.target.value })} {...tip('Kept with your shot. Soon an assistant will set the scene up from this.')} />
            : step === 'mockup' ? <div ref={setSlotMain} className="ps-main" data-testid="ps-main">{imported && <p className="ps-line">Your scene moves its own camera. Play it here, then record a free mockup.</p>}</div>
            : <div className="ps-main ps-render" data-testid="ps-render-lead">{planSaving ? <p className="ps-line" data-testid="ps-render-saving"><i className="as-spin" aria-hidden /> Saving your new mockup…</p> : lastPlan ? <><button type="button" className="ps-mock" onClick={() => navigate(`/jobs/${lastPlan.id}`)} {...tip('Open this mockup')} aria-label="Open the mockup"><video src={lastPlan.resultUrl ?? undefined} muted playsInline preload="metadata" onError={retryVideo} /></button>
                <span className="ps-mock-t"><b>Mockup · {(lastPlan.input as any)?.previz?.presetName ?? 'Shot'}</b><small>{[(lastPlan.input as any)?.previz?.shot?.seconds ? `${(lastPlan.input as any).previz.shot.seconds} s` : null, (lastPlan.outputs ?? []).map((o) => o.label?.replace(/ view$/, '')).filter(Boolean).join(' + ') || null, ago(lastPlan.createdAt)].filter(Boolean).join(' · ')}</small></span>
                <span className="ps-line">Render uses this saved mockup, not later stage edits. Review the model, length and cost next.</span></>
              : newestPlan ? <p className="ps-line" data-testid="ps-render-empty">No mockup of this version of {imported ? 'your scene' : tplNow.name} yet. Record one: it’s free and takes seconds.{' '}
                <button type="button" className="fd-link" data-testid="ps-use-last" onClick={() => setPlanPick(newestPlan.id)} {...tip('Render your newest mockup instead, from another set')}>Use your last mockup ({(newestPlan.input as any)?.previz?.presetName ?? 'Shot'})</button></p>
              : <p className="ps-line" data-testid="ps-render-empty">Record a mockup first. It’s free and takes seconds; then it turns into real video here.</p>}</div>)
          : isSoon && soonAlt ? <p className="ic-noprompt t3-soon" data-testid="t3-soon"><b>{wf.name} is coming soon.</b> {soonAlt.line}{soonAlt.alt && <>{' '}<a className="fd-link" href={soonAlt.alt.href} data-testid="t3-soon-alt" onClick={(e) => { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); navigate(soonAlt.alt!.href); }}>{soonAlt.alt.label}</a></>}</p>
          : textMode ? <textarea className="ic-prompt prompt-field" rows={2} aria-label="Describe your model" data-testid="t3-prompt" placeholder={recipe.prompt.placeholder} value={draft.prompt} readOnly={busy} onChange={e => setDraft(d => ({ ...d, prompt: e.target.value }))} />
          : <p className="ic-noprompt" data-testid="t3-noprompt">{isTT ? (ttJob ? 'Your browser records one orbit of the model and keeps it as a video. Free, nothing goes to a provider.' : 'Make a 3D model first, then record its turntable here.') : multiMode ? 'Add a front view and at least one side or back view of the same object. Different image sizes are fine.' : 'No prompt needed: Image to 3D works from your picture and the settings below.'}</p>}
          <input ref={htmlIn} type="file" accept=".html,.htm,text/html" hidden data-testid="ps-html-file" onChange={(e) => { const f = e.target.files?.[0] ?? null; e.currentTarget.value = ''; void takeHtml(f); }} />
          <input ref={fileIn} type="file" accept={IMAGE_ACCEPT} hidden data-picker-title={multiMode ? "Choose a view of the object" : "Choose an image to turn into 3D"} data-picker-limits="PNG, JPG or WEBP · one clear object works best" data-testid="t3-file" onChange={(e) => { const f = e.target.files?.[0]; e.currentTarget.value = ''; if (f) takeFile(pickedSlot.current, f); }} />
        </div>
        <div className="ic-chiprow"><div ref={chipsEl} className="ic-chips">
          <span className="ic-fixed" data-testid="t3-chips-fixed">{chip}
            {!noModel && <button ref={mRef} type="button" className={`ic-chip ic-model ${pop === 'model' ? 'on' : ''}`} data-testid="t3-model" aria-label={`Model: ${modelName}. Change model`} aria-haspopup="listbox" aria-expanded={pop === 'model'} {...tip(pop === 'model' ? null : `${modelName}${modelPriceNote ? ` · ${modelPriceNote}` : ''}`)} onClick={() => setPop(pop === 'model' ? '' : 'model')}>
              <MakerTile className="ic-dot" medium="3d" maker={tm?.maker ?? model?.maker} makerName={tm?.makerName ?? model?.makerName} fallback={modelName} /><span className="ic-mname">{displayNameOf(tm as any, null) ?? modelName}</span><svg className="ic-caret" width="16" height="16" viewBox="0 0 16 16" aria-hidden><path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg></button>}</span>
          {isPS && step === 'stage' && <>
            {!imported && <button ref={camRef} type="button" className={`ic-chip ps-chip${pop === 'camera' ? ' on' : ''}`} data-testid="ps-camera" aria-haspopup="dialog" aria-expanded={pop === 'camera'} onClick={() => setPop(pop === 'camera' ? '' : 'camera')} {...tip(pop === 'camera' ? null : 'The camera move and its speed')}><CameraMoveIcon /><b>{planSummaries.camera}</b></button>}
            {!imported && <button ref={colRef} type="button" className={`ic-chip ps-chip${pop === 'colour' ? ' on' : ''}`} data-testid="ps-colour" aria-haspopup="dialog" aria-expanded={pop === 'colour'} onClick={() => setPop(pop === 'colour' ? '' : 'colour')} {...tip(pop === 'colour' ? null : `${tplNow.subjectLabel}: ${colourOf(shot.colour).label}`)}><i className="ps-sw" style={{ background: colourOf(shot.colour).hex }} aria-hidden /><b>{colourOf(shot.colour).label}</b></button>}</>}
          {isPS && step === 'render' && <>
            <button type="button" className="ic-chip ps-chip" data-testid="ps-render-model" disabled={!lastPlan || psBusy} onClick={(e) => lastPlan && openMir(lastPlan.id, e.currentTarget)} {...tip('Review the real model, connection, duration and price in Render settings. Nothing runs when this opens.')}><SparkleIcon size={15} /><b>Model &amp; cost</b></button>
            <span className="ic-chip ic-static ps-fact" data-testid="ps-render-cost">Your computer or cloud</span>
            <button type="button" className="ic-chip ps-chip" data-testid="ps-back-mockup" onClick={() => setStep('mockup')} disabled={psBusy} {...tip(lastPlan ? 'Back to Mockup: pick another take and record again' : 'Back to Mockup: record this shot')}>{lastPlan ? 'Record another' : 'Record one'}</button></>}
          {isPS && <span ref={setSlotChips} className="ps-slot-chips" data-testid="ps-slot-chips" />}
          {!noModel && <WorkflowControls recipe={recipe} files={activeFiles} vals={{ detail: set.detail, texture: set.texture, faces: set.faces }} setVal={(k, v) => setDraft((d) => ({ ...d, vals: { ...d.vals, [k]: v } }))} provider={provider} watch={dock} optPrice={optPrice} />}
          {!noModel && <span className="ic-chip ic-static" data-fold="fmt" data-testid="t3-format" {...tip('The file you get: GLB (glTF binary), opens in Blender, game engines and most 3D viewers')}><CubeIcon size={14} />GLB</span>}
          {!noModel && model?.symmetry && <span className="ic-chip ic-static" data-testid="t3-symmetry">Symmetry: Auto</span>}
          {isTT && <span className="ic-chip ic-static" data-testid="t3-tt-len" {...tip('One full orbit')}><OrbitIcon size={14} />6 s orbit</span>}
          {!noModel && <button ref={setRef} type="button" className={`ic-chip ic-sq vs-sq${pop === 'set' ? ' on' : ''}`} data-testid="t3-settings" aria-haspopup="dialog" aria-expanded={pop === 'set'} aria-label={`Settings: seed ${seed || 'random'}${fo('fmt') ? ', format GLB' : ''}`} {...tip(pop === 'set' ? null : 'Settings')} onClick={() => setPop(pop === 'set' ? '' : 'set')}><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden><path d="M3 4h6M12 4h1M3 12h1M7 12h6M3 8h3M9 8h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /><circle cx="10.5" cy="4" r="1.5" fill="none" stroke="currentColor" strokeWidth="1.4" /><circle cx="5.5" cy="12" r="1.5" fill="none" stroke="currentColor" strokeWidth="1.4" /><circle cx="7.5" cy="8" r="1.5" fill="none" stroke="currentColor" strokeWidth="1.4" /></svg></button>}
          {!noModel && <RowMore watch={dock} testId="t3-row-over" />}
        </div>
          {!noModel && tm && <RunOnChip compact toolId={TOOL} model={tm} engine={provider} quote={q} testId="t3-run-on" watch={dock} />}
          {!noModel && <PromptPeek form={peekForm} place={ro.sub ? `${ro.main} (${ro.sub})` : ro.main} photos={recipe.slots.filter(s => !!activeFiles[s.name]).map(s => s.label)} watch={dock} />}
        </div>
      </div>
      {isPS ? (takeReady ? <button type="button" className="ic-gen gen-btn gen-dock btn btn-primary ps-use-take" data-testid="pv-use-take" disabled={psBusy} aria-label={`Use ${takeReady.name}${takeReady.performance ? ' with its follow camera' : ''} in Mockup`} onClick={() => player.current?.useTake()} {...tip(`Finish live controls and select ${takeReady.name}. Nothing records until Record mockup.`)}><span className="gen-l">Use this take</span><small className="t3-time">Next: Mockup · free</small></button>
        : step === 'stage' ? <button type="button" className="ic-gen gen-btn gen-dock btn btn-primary" data-testid="ps-next" disabled={psBusy || !!playerBlock} onClick={() => setStep('mockup')} {...tip('Next: Mockup. Your browser films this camera move as a rough test video, free and in seconds. You check the motion and framing before the real render.')}>
          <span className="gen-l">Next: Mockup</span><span className="t3-pt">{playerBlock ? <small className="t3-time" data-testid="ps-next-sub">{playerBlock}</small> : <><GenPrice compact free text="Free" /><small className="t3-time" data-testid="ps-next-sub">quick test video</small></>}</span></button>
        : step === 'render' && !psBusy ? (planSaving ? <button type="button" className="ic-gen gen-btn gen-dock btn btn-primary gen-wait" disabled data-testid="ps-render-wait"><span className="gen-l"><i className="as-spin" aria-hidden />Saving</span><small className="t3-time">one moment</small></button> : lastPlan ? (mirRunning ? <button type="button" className="ic-gen gen-btn gen-dock btn btn-primary ps-running" data-testid="pv-make-real-running" onClick={() => mirRunning.onOpen()} {...tip('Open the take: it fills in when the render is done')}>
              <span className="gen-l"><i className="as-spin" aria-hidden />Rendering</span><small className="t3-time">{mirRunning.text}</small></button>
            : <button type="button" className="ic-gen gen-btn gen-dock btn btn-primary" data-testid="pv-make-real" onClick={(e) => openMir(lastPlan.id, e.currentTarget)} {...tip('Render real video from this mockup. Free on your computer, or pick a cloud model in the sheet.')}>
              <span className="gen-l">Render video</span><small className="t3-time">Review model &amp; cost</small></button>)
          : <button type="button" className="ic-gen gen-btn gen-dock btn btn-primary" data-testid="ps-to-mockup" onClick={() => setStep('mockup')}><span className="gen-l">Go to Mockup</span><span className="t3-pt"><GenPrice compact free text="Free" /><small className="t3-time">record first</small></span></button>)
        : <button type="button" className={`ic-gen gen-btn gen-dock btn btn-primary${psBlock ? ' gen-wait' : ''}`} data-testid="ps-record" {...tip('Record mockup: free, takes seconds. Your browser draws every frame.')} disabled={psBusy} aria-busy={psBusy || undefined} aria-disabled={!!psBlock || undefined}
          onClick={(e) => { if (psBlock) { nudgeMissing(e.currentTarget); toast(psBlock === 'Fix the scene first' ? 'This scene doesn’t follow the contract yet. The problems are on the player.' : psBlock, 'info'); return; } void record(); }}>
          <span className="gen-l">{psBusy ? <i className="as-spin" aria-hidden /> : null}{psBusy ? (saving ? 'Saving…' : `Recording ${recording ? Math.round((100 * recording.done) / Math.max(1, recording.total)) : 0}%`) : 'Record mockup'}</span>
          {psBlock ? <span className="gen-price gen-missing" data-testid="ps-price">{psBlock}</span> : <span className="t3-pt"><GenPrice compact testId="ps-price" free text="Free" /><small className="t3-time">{effShot.seconds} s · {recMode === 'clay-depth' ? '2 videos' : '1 video'}</small></span>}</button>)
        : isSoon && soonAlt ? <button type="button" className="ic-gen gen-btn gen-dock btn btn-primary" data-testid="t3-soon-go" onClick={() => pick(soonAlt.go)} {...tip(`${wf.name} is coming soon. ${threeDWorkflowById(soonAlt.go)?.name}: ${threeDWorkflowById(soonAlt.go)?.tagline}`)}>
          <span className="gen-l">Use {threeDWorkflowById(soonAlt.go)?.name}</span><small className="t3-time">works today</small></button>
        : isTT ? <button type="button" className={`ic-gen gen-btn gen-dock btn btn-primary${!ttJob ? ' gen-wait' : ''}`} data-testid="t3-generate" aria-disabled={!ttJob || undefined} onClick={(e) => { if (!ttJob) { nudgeMissing(e.currentTarget); return; } setView({ kind: 'job', id: ttJob.id, record: true }); }}>
          <span className="gen-l">Record turntable</span>{ttJob ? <GenPrice compact testId="t3-price" free text="Free" /> : <span className="gen-price gen-missing" data-testid="t3-price">Make a 3D model first</span>}</button>
        : setupNeeded(tm, q, provider) && !pf.some((p) => p.stage === 'inputs') ? <SetupGenerate toolId={TOOL} model={tm} engine={provider} quote={q} className="ic-gen gen-btn gen-dock btn btn-primary" testId="t3-generate" priceTestId="t3-price" />
        : <button ref={genRef} type="button" className={`ic-gen gen-btn gen-dock btn btn-primary${blocking ? ' gen-wait' : ''}`} data-testid="t3-generate" data-problems={notes.length || undefined} disabled={busy} aria-busy={busy || undefined} aria-disabled={blocking || undefined}
          aria-haspopup={notes.length ? 'dialog' : undefined} aria-expanded={notes.length ? pfOpen : undefined} title={pfOpen ? undefined : (genWord || priceTitle(q, bill, { demo: isDemo, free: isFree, credits }) || undefined)}
          onClick={(e) => { if (blocking) { if (inputMissing) nudgeMissing(e.currentTarget); setPfOpen((o) => !o); return; } void generate(); }}>
          <span className="gen-l">{busy ? <i className="as-spin" aria-hidden /> : null}Generate</span>
          {priceFirst ? <><GenPrice compact testId="t3-price" q={q} demo={isDemo} free={isFree} credits={credits} /><small className="t3-time t3-need" data-testid="t3-time">{inputMissing.toLowerCase()}</small></>
            : genWord ? <span className="gen-price gen-missing" data-testid="t3-price">{genWord}</span>
            : <span className="t3-pt"><GenPrice compact testId="t3-price" q={q} demo={isDemo} free={isFree} credits={unpricedWhy || blockWhy ? null : credits} /><small className="t3-time" data-testid="t3-time">{etaText(typSec)}</small></span>}</button>}
      </div></div>
      <PreflightNotes open={pfOpen} notes={notes} anchor={genRef} dock={dock} onClose={() => setPfOpen(false)} testId="t3-notes" />
      <WorkflowPicker open={pop === 'wf'} anchor={wfRef} watch={dock} list={THREE_D_WORKFLOWS} current={wf.id} categories={THREE_D_CATEGORIES} onChoose={(w) => pick(w.id)} onClose={() => { setPop(''); clearPickerParam(); }} label="3D workflows" prefix="t3wf" noun="3D"
        icon={(w) => <WfIcon name={w.icon} />} how={(w) => <HowSteps w={{ ...w, inputs: [w.needs] } as any} />} soon={(w) => !(data?.workflows.find((x) => x.id === w.id)?.runnable ?? w.status === 'ready')}
        foot={`${THREE_D_WORKFLOWS.filter((w) => w.status === 'ready').length} ready · ${THREE_D_WORKFLOWS.filter((w) => w.status === 'soon').length} coming soon`} />
      {!noModel && <ModelMenu open={pop === 'model'} anchor={mRef} avoid={dock} watch={dock} gap={4} placement="top" onClose={() => setPop('')} items={items} value={provider} testId="t3-model-list" rowTestId={(id) => `t3-model-${id}`} toolId={TOOL} quote={q}
        onPick={(id) => { setDraft((d) => ({ ...d, provider: id, pickedBy: 'user' } as any)); setPop(''); }} defaultId={def?.active?.id ?? defId} defaultWhy={def?.active?.why ?? def?.why?.hosted ?? null} defaultReason={def?.active?.runs === false ? def.active.reason ?? null : null}
        onReset={draft.provider && draft.provider !== defId ? () => { setDraft((d) => ({ ...d, provider: '' })); setPop(''); } : null} />}
      <BarPopover open={pop === 'set'} anchor={setRef} avoid={dock} watch={dock} onClose={() => setPop('')} label="Settings" role="dialog" testId="t3-settings-menu" width={300}>{<div className="bp-wrap t3-set">
        <PopSection label="Seed" aside={model?.seed ? (seed ? <span className="bp-mono">{seed}</span> : 'Random') : undefined}>
          {model?.seed ? <label className="bp-field"><input type="number" min={0} inputMode="numeric" placeholder="Random" aria-label="Seed" value={seed} data-testid="t3-seed" onChange={(e) => setDraft((d) => ({ ...d, vals: { ...d.vals, seed: e.target.value.replace(/\D/g, '') } }))} /><small>Same seed + same settings = a similar model</small></label>
            : <p className="bp-fact">{modelName} picks its own seed.</p>}</PopSection>
        <PopSection label="Format" aside="GLB"><p className="bp-fact">One file with its textures inside. Opens in Blender, game engines and most 3D apps.</p></PopSection>
      </div>}</BarPopover>
      {isPS && <BarPopover open={pop === 'camera'} anchor={camRef} avoid={dock} watch={dock} onClose={() => setPop('')} label="Camera" role="dialog" testId="ps-camera-menu" width={320}><div className="bp-wrap ps-pop">{planPanels.camera}</div></BarPopover>}
      {isPS && <BarPopover open={pop === 'colour'} anchor={colRef} avoid={dock} watch={dock} onClose={() => setPop('')} label={tplNow.subjectLabel} role="dialog" testId="ps-colour-menu" width={320}><div className="bp-wrap ps-pop">{planPanels.colour}</div></BarPopover>}
      {isPS && <BarPopover open={pop === 'more'} anchor={moreRef} onClose={() => setPop('')} label="More" role="dialog" testId="ps-more-menu" width={320} placement="bottom" align="end"><div className="bp-wrap ps-pop">
        <PopSection label="Preview style"><Segmented label="Preview style" value={pvView} testId="pv-views" onChange={(v) => setPs((p) => ({ ...p, view: v }))} options={PREVIZ_PASSES.map((x) => ({ value: x.id, label: x.label, hint: viewAllowed.includes(x.id) ? undefined : 'Not in this scene', disabled: !viewAllowed.includes(x.id), title: x.hint, testId: `pv-view-${x.id}` }))} /></PopSection>
        {!imported && <PopSection label="Graphics"><Segmented label="Graphics" value={gfx} testId="pv-quality" onChange={(v) => setPrevizQuality(v)} options={QUALITIES.map((q) => ({ value: q, label: QUALITY_LABEL[q], title: QUALITY_HINT[q], testId: `pv-quality-${q}` }))} />
          <p className="bp-fact" data-testid="pv-quality-note">{pvView === 'beauty' ? QUALITY_HINT[gfx] : 'Clay and Depth always draw plain, so Render reads them the same way.'}</p></PopSection>}
        {planPanels.frame}{planPanels.record}
        <PopSection label="Layout number (seed)" aside={<span className="bp-mono">{shot.seed}</span>}><label className="bp-field"><input type="number" min={0} inputMode="numeric" aria-label="Seed" value={shot.seed} data-testid="ps-seed" onChange={(e) => setShot({ seed: Number(e.target.value.replace(/\D/g, '') || 0) })} /><small>Changes the small details: where houses, trees and buildings go. Same number = the same scene.</small></label>
          {!imported && <button type="button" className="pv-btn ps-shuffle" data-testid="ps-shuffle" onClick={() => setShot({ seed: (shot.seed * 48271 + 11) % 99991 })}>Try another layout</button>}</PopSection>
        <PopSection label="Size"><p className="bp-fact">Recorded at {PREVIZ_SIZE_TEXT[effShot.aspect]} (MP4, H.264), frame by frame.</p></PopSection></div></BarPopover>}
      <BarPopover open={pop === 'preset'} anchor={sceneAnchor} avoid={dock} watch={dock} onClose={() => setPop('')} label="Scenes" role="dialog" testId="ps-preset-menu" width={760} closeButton align={sceneAnchor.current === presetRef.current ? 'start' : 'center'}>
        <div className="t3-scenes"><SceneGrid label="Scenes" items={sceneItems} value={imported ? null : shot.template} onPick={pickScene} groups={[{ id: 'presets', label: 'Ready-made' }, { id: 'own', label: 'Your own' }]} testId="ps-scenes" min={210}
          foot="Presets are drawn live in your browser and cost nothing. Switching keeps your note and seed." /></div>
      </BarPopover>
      <BarPopover open={pop === 'tt'} anchor={ttRef} avoid={dock} watch={dock} onClose={() => setPop('')} label="3D results" role="listbox" testId="t3-tt-menu" width={300}><PopSection label="Record which model"><PopList label="3D results">
        {done3d.slice(0, 12).map((j) => <PopRow key={j.id} selected={ttJob?.id === j.id} icon={posterOf3d(j) ? <img src={posterOf3d(j)!} alt="" className="t3-tt-th" /> : <CubeIcon size={16} />} label={(j as any).model ?? '3D model'} hint={new Date(j.createdAt ?? 0).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })} onClick={() => { setTtPick(j.id); setPop(''); }} />)}</PopList></PopSection></BarPopover>
    </div></div>
  </div>;


}
function exItem(d: Payload, i: number): Item3D | null {
  const s = d.showcase.items[i]; if (!s) return null; const ds = d.showcase.dataset;
  return { key: s.id, src: s.glb, name: s.title, role: `Made with ${s.model}`, poster: s.preview, inputUrl: s.input, inputLabel: 'Input image', mb: s.glbMB, downloadName: `scenario-${s.id}.glb`,
    badge: <span className="rvx-badges"><em className="exv-chip" {...tip('An example from Scenario’s open 3D dataset. It isn’t in your library.')}>Example</em></span>,
    rows: [['Model', exampleModel(s.model, d.models) ? s.model : <span data-testid="v3d-not-in-app">{s.model} <em className="t3-notin-row">· Use this image picks the default model</em></span>], ['Made by', ds.credit], ['Licence', <a href={ds.licenceUrl} target="_blank" rel="noreferrer">{ds.licence}</a>], ['Source', <a href={ds.url} target="_blank" rel="noreferrer">{ds.name}</a>]],
    credit: <>3D models: <a href={ds.url} target="_blank" rel="noreferrer">Scenario</a> (<a href={ds.licenceUrl} target="_blank" rel="noreferrer">CC BY 4.0</a>), loaded from Hugging Face.</> };
}

/** One 3D result in the feed: its still (the poster the viewer saved, else its input picture), a hover turntable when one was recorded, the model,
 *  faces / texture, price · time, the GLB download and Make a video. Running jobs show the shared generating tile; failures the shared failure tile. */
function Card({ j, own, onOpen, onVideo, onRetry, onMakeReal }: { j: JobState; own: boolean; onOpen: (from: HTMLElement) => void; onVideo: () => void; onRetry: () => void; onMakeReal: (anchor: HTMLElement) => void }) {
  const isTT = j.toolId === 'three-d-turntable'; const meta = useMeta3d(j.status === 'done' && !isTT ? j.resultUrl : null); const poster = posterOf3d(j); const tt: string | null = (j as any).threeD?.turntableUrl ?? null;
  const t = jobTiming(j as any); const cap = jobCaption(j, own); const price = cap.price || 'Free'; /* the shared caption words (shared/FeedCaption.tsx), Image's too */
  if (j.status === 'queued' || j.status === 'running') return <div className="vs-htile t3-card" data-testid={`t3-card-${j.id}`}><GenTile job={j} testId={`t3-run-${j.id}`} /></div>;
  if (j.status !== 'done') return <div className="vs-htile t3-card fs-host" data-testid={`t3-card-${j.id}`}><span className="vs-hwait fs-host"><FailureState job={j} variant="tile" testId={`t3-fail-${j.id}`} />
    {j.status === 'failed' && <span className="fs-tile-act"><button type="button" className="fs-btn fs-btn-main fs-btn-sm" data-testid={`t3-retry-${j.id}`} onClick={onRetry}>Retry</button></span>}</span></div>;
  if (j.toolId === PREVIZ_TOOL) { const pv = (j.input as any)?.previz ?? {}; const outs = j.outputs ?? []; const ar = pv.width && pv.height ? `${pv.width} / ${pv.height}` : '16 / 9';
    return <div className="vs-htile t3-card ps-card" data-testid={`ps-card-${j.id}`}><button type="button" className="t3-hit" onClick={() => navigate(`/jobs/${j.id}`)} aria-label={`Open mockup: ${pv.presetName ?? 'Direct a Shot'}`}>
      <video src={j.resultUrl ?? undefined} poster={videoCardPoster(j)} muted loop playsInline preload="metadata" onLoadedMetadata={vidReady} onError={retryVideo} data-tall={pv.height > pv.width || undefined} style={{ aspectRatio: ar }} onMouseEnter={(e) => e.currentTarget.play().catch(() => 0)} onMouseLeave={(e) => { e.currentTarget.pause(); }} /></button>
      <em className="t3-kind"><VideoIcon size={12} />{outs.length > 1 ? `${outs.length} mockups` : 'Mockup'}</em>
      <FeedCaption title={`Mockup · ${pv.presetName ?? 'Shot'}`} parts={['Free', outs.map((o) => o.label?.replace(/ view$/, '')).filter(Boolean).join(' + ') || null, pv.shot ? `${pv.shot.seconds} s · ${pv.fps} fps` : null]} testId={`ps-cap-${j.id}`} />
      <span className="t3-acts"><a className="t3-act" href={j.resultUrl ?? '#'} download={appFileName(j.id, 'mp4')} data-testid={`ps-dl-${j.id}`} aria-label="Download MP4" {...tip('Download MP4')}><DownloadIcon size={14} /></a>
        <button type="button" className="t3-act ps-act-real" data-testid={`ps-real-${j.id}`} aria-label="Render real video" {...tip('Render real video from this mockup. Free on your computer.')} onClick={(e) => onMakeReal(e.currentTarget)}><SparkleIcon size={14} /></button>
        <a className="t3-act" href={`/jobs/${j.id}`} onClick={(e) => { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); navigate(`/jobs/${j.id}`); }} aria-label="Open in Assets" {...tip('Open in Assets')}><MoreIcon size={14} /></a></span>
      {(() => { const mr: any[] = (j as any).madeReal ?? []; const last = mr[0]; return last ? <a className="ps-real-chip on" href={`/jobs/${last.id}`} data-testid={`ps-real-link-${j.id}`} onClick={(e) => { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); navigate(`/jobs/${last.id}`); }}><SparkleIcon size={11} />{last.status === 'done' ? `Rendered${mr.length > 1 ? ` · ${mr.length}` : ''}` : last.status === 'running' || last.status === 'queued' ? 'Rendering…' : 'Render'}</a>
        : <button type="button" className="ps-real-chip" data-testid={`ps-real-chip-${j.id}`} onClick={(e) => onMakeReal(e.currentTarget)}><SparkleIcon size={11} />Render video</button>; })()}</div>; }
  if (j.toolId === MAKE_REAL_TOOL) { const m = (j.input as any)?.makeReal ?? {}; const p = m.plan ?? {}; const ar = p.width && p.height ? `${p.width} / ${p.height}` : '16 / 9'; const sample = /sample/i.test(j.outputs?.[0]?.label ?? '');
    return <div className="vs-htile t3-card ps-card mir-card" data-testid={`mir-card-${j.id}`}><button type="button" className="t3-hit" onClick={() => navigate(`/jobs/${j.id}`)} aria-label={`Open the take: ${m.presetName ?? 'Render'}`}>
      <video src={j.resultUrl ?? undefined} poster={videoCardPoster(j)} muted loop playsInline preload="metadata" onLoadedMetadata={vidReady} onError={retryVideo} data-tall={p.height > p.width || undefined} style={{ aspectRatio: ar }} onMouseEnter={(e) => e.currentTarget.play().catch(() => 0)} onMouseLeave={(e) => { e.currentTarget.pause(); }} />
      {m.planUrl && <video className="mir-card-plan" src={m.planUrl} poster={planPoster(m.planUrl)} muted playsInline preload="metadata" onLoadedMetadata={vidReady} aria-hidden />}</button>
      <em className="t3-kind mir-kind"><SparkleIcon size={12} />Render</em>{sample && <em className="t3-kind t3-sample" {...tip('Sample mode: a colour-graded copy of the mockup. No model ran.')}>Sample</em>}
      <FeedCaption title={`Take · ${m.presetName ?? 'Shot'}`} parts={['Free', p.seconds ? `${p.seconds} s · ${p.width}×${p.height}` : null, durationText(jobTiming(j as any).renderMs) || null]} testId={`mir-cap-${j.id}`} />
      <span className="t3-acts"><a className="t3-act" href={j.resultUrl ?? '#'} download={appFileName(j.id, 'mp4')} data-testid={`mir-dl-${j.id}`} aria-label="Download MP4" {...tip('Download MP4')}><DownloadIcon size={14} /></a>
        {m.planJobId && <button type="button" className="t3-act" data-testid={`mir-again-${j.id}`} aria-label="Render again" {...tip('Render again from the same mockup')} onClick={(e) => onMakeReal(e.currentTarget)}><SparkleIcon size={14} /></button>}
        <a className="t3-act" href={`/jobs/${j.id}`} onClick={(e) => { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); navigate(`/jobs/${j.id}`); }} aria-label="Mockup vs Render" {...tip('Open: Mockup vs Render')}><MoreIcon size={14} /></a></span></div>; }
  if (isTT) return <div className="vs-htile t3-card" data-testid={`t3-card-${j.id}`}><button type="button" className="t3-hit" onClick={() => navigate(`/jobs/${j.id}`)} aria-label="Open turntable video">
      <video src={j.resultUrl ?? undefined} poster={videoCardPoster(j)} muted loop playsInline preload="metadata" onLoadedMetadata={vidReady} onError={retryVideo} onMouseEnter={(e) => e.currentTarget.play().catch(() => 0)} onMouseLeave={(e) => e.currentTarget.pause()} /></button>
    <FeedCaption title="Turntable video" parts={['Free', durationText(t.renderMs) || 'recorded in your browser']} testId={`t3-cap-${j.id}`} /><em className="t3-kind"><VideoIcon size={12} />Video</em></div>;
  return <div className="vs-htile t3-card" data-testid={`t3-card-${j.id}`}>
    <button type="button" className="t3-hit" onClick={(e) => onOpen(e.currentTarget)} aria-label={`Open 3D model: ${(j as any).model ?? ''}`}>
      {poster ? <img src={poster} alt="" loading="lazy" draggable={false} /> : j.input?.imageUrl ? <img className="t3-in" src={j.input.imageUrl} alt="" loading="lazy" draggable={false} /> : <CubeIcon size={28} />}
      {tt && <video className="t3-tt" src={tt} muted loop playsInline preload="none" aria-hidden onMouseEnter={(e) => e.currentTarget.play().catch(() => 0)} onMouseLeave={(e) => { e.currentTarget.pause(); e.currentTarget.currentTime = 0; }} />}</button>
    <em className="t3-kind" {...tip(poster ? '3D model (GLB)' : '3D model: the still appears once you open it')}><CubeIcon size={12} />Model</em>{(j as any).demo && <em className="t3-kind t3-sample">Sample</em>}
    <FeedCaption title={cap.model || '3D model'} parts={[metaShort(meta), price, durationText(t.renderMs) || cap.time]} testId={`t3-cap-${j.id}`} />
    <span className="t3-acts"><a className="t3-act" href={j.resultUrl ?? '#'} download={appFileName(j.id, 'glb')} data-testid={`t3-dl-${j.id}`} aria-label="Download GLB" {...tip('Download GLB')}><DownloadIcon size={14} /></a>
      <button type="button" className="t3-act" data-testid={`t3-video-${j.id}`} aria-label="Make a video" {...tip(tt ? 'Record another turntable video (free)' : 'Make a video: record a turntable (free)')} onClick={onVideo}><VideoIcon size={14} /></button>
      <a className="t3-act" href={directShotHref(j.id)} data-testid={`t3-shot-${j.id}`} aria-label="Use in Direct a Shot" onClick={(e) => { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); navigate(directShotHref(j.id)); }} {...tip('Use in Direct a Shot: film this model in a 3D set, as a prop or the actor (free)')}><PrevizIcon size={14} /></a>
      <a className="t3-act" href={`/jobs/${j.id}`} onClick={(e) => { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); navigate(`/jobs/${j.id}`); }} aria-label="Open in Assets" {...tip('Open in Assets')}><MoreIcon size={14} /></a></span>
  </div>;
}

/** Made with these models: Scenario's open 3D examples (CC BY 4.0), before → after, loaded from Hugging Face. Stills only; a click opens the viewer. */
function Showcase({ sc, models, onOpen }: { sc: Payload['showcase']; models: ThreeDModel[]; onOpen: (i: number, from: HTMLElement) => void }) {
  const [bad, setBad] = useState<Set<string>>(new Set()); const allBad = sc.items.length > 0 && bad.size >= sc.items.length;
  /* the input picture's corner box shows only once its picture has loaded; a picture that fails hides the box (UX audit #9) */
  const [inOk, setInOk] = useState<Set<string>>(new Set()); const markIn = (id: string) => setInOk((b) => (b.has(id) ? b : new Set(b).add(id)));
  return <section className="t3-show" aria-label="Made with these models" data-testid="t3-showcase">
    <div className="t3-show-h"><h2>Made with these models</h2><p className="t3-credit" data-testid="t3-credit">3D models: <a href={sc.dataset.url} target="_blank" rel="noreferrer">Scenario</a> (<a href={sc.dataset.licenceUrl} target="_blank" rel="noreferrer">CC BY 4.0</a>)</p></div>
    {allBad ? <ul className="t3-show-links" data-testid="t3-showcase-links">{sc.items.map((s) => <li key={s.id}><a href={s.glb} target="_blank" rel="noreferrer">{s.title}</a> · {s.model}</li>)}</ul>
      : <div className="t3-show-row">{sc.items.map((s, i) => { const inApp = !!exampleModel(s.model, models);
        return <button key={s.id} type="button" className="t3-ex" data-testid={`t3-ex-${i}`} onClick={(e) => onOpen(i, e.currentTarget)} aria-label={`${s.title}, made with ${s.model}. Open in 3D`} hidden={bad.has(s.id)}>
        <span className="t3-ex-media"><img src={s.preview} alt="" loading="lazy" decoding="async" onError={() => setBad((b) => new Set(b).add(s.id))} />
          <span className={`t3-ex-in${inOk.has(s.id) ? ' ok' : ''}`} data-testid={`t3-ex-in-${i}`} data-ok={inOk.has(s.id) || undefined} {...tip('The input image')}><img src={s.input} alt="" loading="lazy" decoding="async"
            ref={(el) => { if (el?.complete && el.naturalWidth > 0) markIn(s.id); }} onLoad={(e) => { if (e.currentTarget.naturalWidth > 0) markIn(s.id); }} /></span>
          {!inApp && <em className="t3-notin" data-testid={`t3-ex-notin-${i}`} {...tip(`An example made with ${s.model}. Use this image picks one of the models here.`)}>Made with {s.model}</em>}</span>
        <span className="t3-ex-t"><b>{s.title}</b><span><MakerTile className="t3-ex-dot" medium="3d" maker={s.modelKey} fallback={s.model} />{s.model} · {s.glbMB} MB</span></span></button>; })}</div>}
  </section>;
}

/** The card still for results that have none yet: renders each in a small hidden viewer, one at a time, at the low priority of the one live
 *  viewer (the open viewer takes over), saves the poster, moves on. Off while the viewer is open. */
function PosterMaker({ jobs, paused, onSaved }: { jobs: JobState[]; paused: boolean; onSaved: () => void }) {
  const todo = jobs.filter((j) => !posterOf3d(j) && !(j as any).demo_skip); const [failed, setFailed] = useState<Set<string>>(new Set()); const next = todo.find((j) => !failed.has(j.id));
  const v = useRef<Model3DHandle>(null);
  if (paused || !next) return null;
  return <div className="t3-postermaker" aria-hidden data-testid="t3-postermaker"><Model3D key={next.id} ref={v} slot="poster" pri={1} src={next.resultUrl!} alt="" autoRotate={false} controls={false} cameraOrbit={startOrbitOf(next)}
    onLoad={() => setTimeout(() => { void v.current?.snapshot().then((b) => (b ? savePoster(next.id, b) : null)).then((u) => { if (u) onSaved(); else setFailed((f) => new Set(f).add(next.id)); }); }, 700)}
    onError={() => setFailed((f) => new Set(f).add(next.id))} /></div>;
}

// ---------------- Direct a Shot helpers ----------------
type PlanState = { shot: PlanShot; view: PrevizPass; rec: 'view' | 'clay-depth'; step: PlanStep };
const PLAN_KEY = 'ohf:plan-a-shot';
/** The saved shot (this browser only; a convenience). Anything unreadable falls back to the first preset. */
function loadPlan(): PlanState { try { const x = JSON.parse(localStorage.getItem(PLAN_KEY) ?? 'null'); if (x && typeof x === 'object') return { shot: normalizePlanShot(x.shot), view: PREVIZ_PASSES.some((p) => p.id === x.view) ? x.view : 'beauty', rec: x.rec === 'clay-depth' ? 'clay-depth' : 'view', step: x.step === 'mockup' || x.step === 'render' ? x.step : 'stage' }; } catch { /* private window */ }
  return { shot: defaultPlanShot(), view: 'beauty', rec: 'view', step: 'stage' }; }
function savePlan(p: PlanState) { try { localStorage.setItem(PLAN_KEY, JSON.stringify(p)); } catch { /* private window */ } }
const ASPECT_HINT: Record<string, string> = { '16:9': 'Wide: TV, YouTube, a laptop', '9:16': 'Tall: phones, Reels, Shorts', '1:1': 'Square: feeds' };
const PREVIZ_SIZE_TEXT: Record<string, string> = { '16:9': '1280 × 720', '9:16': '720 × 1280', '1:1': '960 × 960' };
/** "2 min ago" for the Render step's mockup line */
function ago(at?: number | null) { if (!at) return null; const m = Math.round((Date.now() - at) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : new Date(at).toLocaleDateString(); }
/* a camera on a track, in the icon set's style (24 grid, 1.5 stroke) */
const CameraMoveIcon = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="3" y="6" width="12" height="9" rx="2" /><path d="m15 9.5 5-2.5v8l-5-2.5" /><path d="M3 19.5h18" /></svg>;

/** The feed's kind filter: what you picked on this workflow, else the workflow's default (feed3d.ts); a new workflow starts from its default. */
function useFeedKinds(results: JobState[], wfId: string) {
  const [picked, setPicked] = useState<{ wf: string; kinds: FeedKind[] | 'all' } | null>(null);
  const counts = countKinds(results); const pick = picked && picked.wf === wfId ? picked.kinds : null;
  const kinds = pick === 'all' ? null : shownKinds(pick, wfId, counts); /* null = All */
  const shownJobs = kinds ? results.filter((j) => kinds.includes(kindOfJob(j))) : results;
  return { kinds, setKinds: (k: FeedKind[] | 'all') => setPicked({ wf: wfId, kinds: k }), counts, shownJobs };
}
type View3d = { kind: 'job'; id: string; record?: boolean } | { kind: 'ex'; i: number };
/** The open viewer as ?view=<job id> or ?view=ex-<example id>, through the shared useFeedViewer (Image's and Video's): Back closes it, a
 *  reload reopens it, ← / → replace it. A job that isn't a finished 3D model (a Render on its way) opens its own page instead. */
function useView3d(done3d: JobState[], data: Payload | null, loaded: boolean) {
  const items = data?.showcase.items ?? []; const [rec, setRec] = useState<string | null>(null);
  const fv = useFeedViewer([...done3d, ...items.map((x) => ({ id: `ex-${x.id}` }) as JobState)], undefined, (id) => `t3-card-${id}`, loaded && !!data);
  const id = fv.viewId; const exI = id?.startsWith('ex-') ? items.findIndex((x) => `ex-${x.id}` === id) : -1;
  const view: View3d | null = !id ? null : id.startsWith('ex-') ? (exI >= 0 ? { kind: 'ex', i: exI } : null) : { kind: 'job', id, record: rec === id };
  const setView = (v: View3d | null, from?: HTMLElement | null) => {
    if (!v) { setRec(null); fv.close(); return; }
    if (v.kind === 'ex') { const x = items[v.i]; if (x) fv.open(`ex-${x.id}`, 0, from); return; }
    if (!done3d.some((j) => j.id === v.id)) { navigate(`/jobs/${v.id}`); return; }
    setRec(v.record ? v.id : null); fv.open(v.id, 0, from);
  };
  const viewJob = view?.kind === 'job' ? done3d.find((j) => j.id === view.id) ?? null : null; const idx = viewJob ? done3d.indexOf(viewJob) : -1;
  const viewNav = { onPrev: idx > 0 ? () => fv.open(done3d[idx - 1].id) : null, onNext: idx >= 0 && idx < done3d.length - 1 ? () => fv.open(done3d[idx + 1].id) : null, pos: done3d.length > 1 ? `${idx + 1} of ${done3d.length}` : undefined };
  return { view, setView, viewJob, viewNav };
}
/** a video card's still has drawn: the shimmer behind it stops */
const vidReady = (e: React.SyntheticEvent<HTMLVideoElement>) => { e.currentTarget.dataset.ready = '1'; };
