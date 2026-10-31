/**
 * One board: tldraw with our theme, our chrome (CanvasUi) and the result card shape. Restores the saved snapshot, autosaves the
 * document (debounced, on tab hide, on leave and on page close), keeps the camera per board in this browser, and sends pictures
 * dropped or uploaded on the board through the app's upload endpoint (POST /api/media), so the snapshot only holds /files/ URLs: into the
 * card under the drop, or as Upload nodes (registerFileDrops).
 * tldraw's licence key check and watermark are untouched (localhost needs no key; VITE_TLDRAW_LICENSE_KEY for a public deployment).
 * Step 2: generate cards (GenCardShape), each with its own controls (no bar). Keys: G makes a new card (tldraw's own G, "last geo
 * shape", is dropped: Rectangle R and Ellipse O stay), ⌘D / Ctrl+D on a generate card makes a variation (on anything else it stays
 * tldraw's Duplicate), Enter generates the selected card. Cards that were running when the board closed follow their job again.
 */
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Tldraw, getSnapshot, useEditor, useValue, DefaultColorStyle, DefaultFontStyle, AssetRecordType, getHashForString, type Editor, type TLAssetStore, type TLComponents, type TLAsset, type TLUiOverrides, type TLShapeId } from 'tldraw';
import 'tldraw/tldraw.css';
import { uploadMedia } from '../shared/batch1';
import { gridSrc, thumbable } from '../shared/thumbs';
import { useToast } from '../shared/Toast';
import { getJob } from '../api';
import { BRAND_THEME } from './theme';
import { ResultCardShapeUtil, RESULT_TYPE, type ResultCardShape } from './resultCardUtil';
import { OPEN_3D_EVENT, runCard } from './canvasEvents';
import { posterOf3d } from '../shared/model3d';
import { LeftToolbar, EmptyHint } from './CanvasUi';
import { AssetsDrawer } from './AssetsDrawer';
import { FollowAgent } from './FollowAgent';
import { bindHand } from './agentHand';
import { NextStepMenu } from './NextStepMenu';
import { CameraMotion } from './CameraMotion';
import { CanvasOverlays, linkArrowVisibility } from './LinkLayer';
import { BoardBackground } from './BoardBackground';
import { GenCardShapeUtil } from './genCardUtil';
import { variationOf } from './variation';
import { PromptNodeUtil, UploadNodeUtil, NoteNodeUtil, CompareNodeUtil, GroupNodeUtil, AdNodeUtil } from './auxShapes';
import { lastFlowNow, setBoardCtx, exposeForDev, createNode, createCard } from './agentApi';
import { reattachRunning } from './genRun';
import { GEN_TYPE, registerLinkCleanup } from './graph';
import { UPLOAD_TYPE, NODE_DEFS } from './nodeTypes';
import { cardState } from './cardState';
import { catalogNow } from './catalog';
import { addCardInputs } from './agentApi';
import { createAuxNode } from './auxShapes';
import { freeSpot } from './placement';
import { planFileDrop, uploadedInput, mediaPoster } from './fileDrop';
import { CARD_H } from './cardModel';
import { saveBoard, saveBoardOnExit, BoardError, type Board as BoardDoc } from './boardsApi';
import { OVERVIEW_ZOOM } from './cardLook';

const Viewer3D = lazy(() => import('../shared/Viewer3D').then(m => ({ default: m.Viewer3D })));
export type SaveState = 'saved' | 'saving' | 'error' | 'conflict';

/** Pictures and clips go through the app's upload path; the board keeps the /files/ URL. Grid thumbnails while zoomed out. */
const assetStore: TLAssetStore = {
  async upload(_asset: TLAsset, file: File) { const [item] = await uploadMedia([file]); if (!item?.url) throw new Error('Upload failed'); return { src: item.url }; },
  resolve(asset, ctx) {
    const src = (asset.props as any).src as string | null; if (!src) return null;
    if (ctx.shouldResolveToOriginal || asset.type !== 'image' || !thumbable(src)) return src;
    const w = Number((asset.props as any).w) || 0; return w ? gridSrc(src, Math.max(160, w * ctx.screenScale)) : src;
  },
};
const SHAPE_UTILS = [ResultCardShapeUtil, GenCardShapeUtil, PromptNodeUtil, UploadNodeUtil, NoteNodeUtil, CompareNodeUtil, GroupNodeUtil, AdNodeUtil];
const THEMES = { default: BRAND_THEME };
/* No tldraw main menu, page menu, toolbar, style panel or navigation clutter: our toolbar, zoom and switcher replace them.
   Context menu, keyboard shortcuts dialog, rich text / image / video toolbars, toasts and dialogs stay tldraw's. */
const COMPONENTS: TLComponents = { MainMenu: null, PageMenu: null, MenuPanel: null, NavigationPanel: null, Toolbar: null, StylePanel: null, HelpMenu: null, ActionsMenu: null,
  QuickActions: null, DebugMenu: null, DebugPanel: null, SharePanel: null, TopPanel: null, Minimap: null, ZoomMenu: null, HelperButtons: null, Grid: null, Background: BoardBackground,
  OnTheCanvas: CanvasOverlays /* links (notches, threads, stardust) and magnetic snap (LinkLayer.tsx) */ };

/** A pasted link becomes a bookmark card with its title, description and picture (our /api/canvas/unfurl reads the page server side). */
function registerLinkPreviews(editor: Editor) {
  editor.registerExternalAssetHandler('url', async ({ url }) => {
    const m: any = await fetch(`/api/canvas/unfurl?url=${encodeURIComponent(url)}`).then(r => (r.ok ? r.json() : null)).catch(() => null);
    let host = url; try { host = new URL(url).hostname.replace(/^www\./, ''); } catch { /* keep the text */ }
    return { id: AssetRecordType.createId(getHashForString(url)), typeName: 'asset', type: 'bookmark', meta: {},
      props: { src: url, title: m?.title || host, description: m?.description ?? '', image: m?.image ?? '', favicon: m?.favicon ?? '' } } as any;
  });
}
/** Files dropped (or pasted) on the board (B2, fileDrop.ts): over a generate card they fill its slots in order, through the same upload and
 *  card write as the slot's Add chip; on empty board, or the ones left over from several, they become Upload nodes near the drop. An Upload
 *  node takes a file dropped on it itself. Never a raw tldraw image. */
function registerFileDrops(editor: Editor, toast: ReturnType<typeof useToast>) {
  editor.registerExternalContentHandler('files', async ({ files, point }) => {
    const at = point ?? editor.getViewportPageBounds().center;
    const hit = editor.getShapeAtPoint(at, { hitInside: true, filter: s => s.type === GEN_TYPE || s.type === UPLOAD_TYPE });
    if (hit?.type === UPLOAD_TYPE) return;
    const st = hit ? cardState(editor, hit, catalogNow()) : null; const slots = st?.spec?.slots ?? [];
    const plan = planFileDrop(files, slots, Object.fromEntries(slots.map(x => [x.name, st!.bySlot[x.name]?.length ?? 0])));
    /* one file on a card that can't take it: say why, like the picker; files no node takes (a PDF) always say why */
    const loose = hit && files.length === 1 ? [] : plan.rest.filter(r => r.kind);
    for (const r of plan.rest) if (!loose.includes(r)) toast(r.why, 'warn');
    /* each file uploads on its own: one refused (a sound too short) says why and the others still land */
    const up = async (i: number) => { try { const [m] = await uploadMedia([files[i]]); if (!m?.url) throw new Error('Upload failed'); return m.url; }
      catch (e) { toast((e as Error).message || 'Upload failed', 'error'); return null; } };
    const [fillUrls, looseUrls] = await Promise.all([Promise.all(plan.fills.map(f => up(f.file))), Promise.all(loose.map(r => up(r.file)))]);
    const filled = plan.fills.flatMap((f, i) => (fillUrls[i] ? [{ input: uploadedInput(f.kind, fillUrls[i]!, files[f.file].name), slot: f.slot }] : []));
    if (hit && filled.length && editor.getShape(hit.id)) { editor.markHistoryStoppingPoint('drop files'); addCardInputs(editor, hit.id, filled); }
    const { defaultW: w, defaultH: h } = NODE_DEFS.upload; const made: TLShapeId[] = [];
    loose.forEach((r, i) => { const url = looseUrls[i]; if (!url) return; const card = hit && editor.getShapePageBounds(hit.id); const near = card ? { x: at.x, y: card.maxY + h / 2 + 40 } : at;
      made.push(createAuxNode(editor, 'upload', { at: freeSpot(editor, w, h, near), select: false, media: { url, poster: mediaPoster(r.kind!, url), mediaKind: r.kind!, label: files[r.file].name } })); });
    if (made.length) editor.select(...made);
  });
}
/* One page per board (2026-10-28): the page menu is hidden, so the context menu's "Move to page → New page" sent a card somewhere no one
   could reach it. Boards are the pages here.
   Smooth zoom (2026-10-30): tldraw writes the zoom into a CSS variable on the board, and every change restyles every card on screen
   (~10 ms a frame with 90 cards). Past 40 shapes it writes it once the camera stops instead of every frame (tldraw's own big-board
   switch, default 500); only zoom-scaled details (link width, card text size) settle when you stop. */
const OPTIONS = { maxPages: 1, debouncedZoomThreshold: 40 };
/** Keyboard: G = new generate card, ⌘D on a generate card = variation (tldraw's actions keep every other shortcut). */
const OVERRIDES: TLUiOverrides = {
  tools(editor, tools) { return { ...tools, note: { ...tools.note, kbd: undefined } }; },
  actions(editor, actions) {
    const dup = actions['duplicate']; const geo = actions['select-geo-tool'];
    const make = (kind: any) => () => { createNode(editor, kind); };
    return { ...actions,
      ...(geo ? { 'select-geo-tool': { ...geo, kbd: undefined } } : {}),
      'ohf-new-gen-card': { id: 'ohf-new-gen-card', label: 'New generate card' as any, kbd: 'g', readonlyOk: false, onSelect: () => { createCard(editor, { flow: lastFlowNow() }); } },
      'ohf-new-note': { id: 'ohf-new-note', label: 'New note node' as any, kbd: 'n', readonlyOk: false, onSelect: make('note') },
      'ohf-new-upload': { id: 'ohf-new-upload', label: 'New upload node' as any, kbd: 'u', readonlyOk: false, onSelect: make('upload') },
      'ohf-new-compare': { id: 'ohf-new-compare', label: 'New compare node' as any, kbd: 'c', readonlyOk: false, onSelect: make('compare') },
      'ohf-new-group': { id: 'ohf-new-group', label: 'Group selection' as any, kbd: 'shift+g', readonlyOk: false, onSelect: make('group') },
      ...(dup ? { duplicate: { ...dup, onSelect: (src: any) => { const only = editor.getOnlySelectedShape(); if (only?.type === GEN_TYPE) { editor.markHistoryStoppingPoint('variation'); variationOf(editor, only.id); return; } return dup.onSelect(src); } } } : {}) };
  },
};
/** Enter with one generate card selected (focus on the board, not in a field) runs it, like its Generate button. */
/** The cards' overview (node.css): under OVERVIEW_ZOOM the editor's container gets data-far and every card shows only its title (large),
 *  its media and one status line. Re-renders only when that flips. */
function OverviewZoom() {
  const editor = useEditor(); const far = useValue('cards far', () => editor.getZoomLevel() < OVERVIEW_ZOOM, [editor]);
  useEffect(() => { const el = editor.getContainer(); if (far) el.dataset.far = '1'; else delete el.dataset.far; }, [editor, far]);
  return null;
}
function CardKeys() {
  const editor = useEditor();
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key !== 'Enter' || e.shiftKey || e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return; const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(t.tagName))) return; const only = editor.getOnlySelectedShape(); if (only?.type !== GEN_TYPE || editor.getEditingShapeId()) return;
      const focusCard = t?.closest?.('[data-shape-id]')?.getAttribute('data-shape-id'); if (focusCard && focusCard !== only.id) return; /* Enter on another focused card selects that one */
      e.preventDefault(); e.stopPropagation(); runCard(only.id); };
    addEventListener('keydown', k, true); return () => removeEventListener('keydown', k, true); }, [editor]);
  return null;
}
const camKey = (id: string) => `ohf-canvas-camera:${id}`;
const readCam = (id: string) => { try { const v = JSON.parse(localStorage.getItem(camKey(id)) ?? 'null'); return v && isFinite(v.x) && isFinite(v.y) && v.z > 0 ? v as { x: number; y: number; z: number } : null; } catch { return null; } };
const writeCam = (id: string, c: { x: number; y: number; z: number }) => { try { localStorage.setItem(camKey(id), JSON.stringify({ x: c.x, y: c.y, z: c.z })); } catch { /* private window */ } };

export function Board({ board, onSaveState, onSaved, drawerOpen, setDrawerOpen, onProject, onEditor }: {
  board: BoardDoc; /** MOCKUP: the card panel needs the editor */ onEditor?: (e: Editor | null) => void; onProject: (id: string | null) => void; onSaveState: (s: SaveState) => void; onSaved: (r: { rev: number; updatedAt: number; shapes: number }) => void; drawerOpen: boolean; setDrawerOpen: (v: boolean) => void;
}) {
  const toast = useToast(); const [view3d, setView3d] = useState<any | null>(null);
  const snapshot = useMemo(() => (board.snapshot ? { document: board.snapshot } as any : undefined), [board.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const f = (e: Event) => { const id = (e as CustomEvent).detail?.jobId; if (!id) return;
    void Promise.all([getJob(id), import('../shared/Viewer3D')]).then(([j, m]) => setView3d(m.jobItem3d(j))).catch(() => toast('This 3D result is no longer available.', 'error')); };
    addEventListener(OPEN_3D_EVENT, f); return () => removeEventListener(OPEN_3D_EVENT, f); }, [toast]);

  useEffect(() => { setBoardCtx({ boardId: board.id, projectId: board.projectId ?? null }); }, [board.id, board.projectId]); /* runs from cards go to the board's project */
  const ed = useRef<Editor | null>(null);
  /* the 3D viewer saves a still the first time a model opens: give cards of that job the new still */
  const close3d = () => { const jobId = view3d?.jobId; setView3d(null); const editor = ed.current; if (!jobId || !editor) return;
    setTimeout(() => { void getJob(jobId).then(j => { const poster = posterOf3d(j); if (!poster) return;
      const cards = editor.getCurrentPageShapes().filter((s): s is ResultCardShape => s.type === RESULT_TYPE && (s as ResultCardShape).props.jobId === jobId && !(s as ResultCardShape).props.poster);
      if (cards.length) editor.updateShapes(cards.map(c => ({ id: c.id, type: RESULT_TYPE, props: { poster } }))); }).catch(() => undefined); }, 1200); };

  const onMount = (editor: Editor) => {
    ed.current = editor; onEditor?.(editor); const id = board.id; let rev = board.rev; let dirty = false, saving = false, stopped = false; let timer = 0, camTimer = 0;
    /* first visit: the pen starts orange and text in Inter; a saved camera comes back, else the board fits its content */
    editor.user.updateUserPreferences({ colorScheme: 'dark' });
    if ((import.meta as any).env?.DEV) (window as any).__ohfCanvas = editor; /* dev only: lets checks drive the board */
    const cam = readCam(id); if (cam) editor.setCamera(cam); else if (editor.getCurrentPageShapeIds().size) editor.zoomToFit();
    reattachRunning(editor); /* step 2: running cards follow their job again */
    /* cards saved at the old 330 px height grow to the new card (title, picture, model row, prompt): once, not an undo step */
    const short = editor.getCurrentPageShapes().filter(s => s.type === GEN_TYPE && (s.props as any).h <= 330 && (s.props as any).h >= 300);
    if (short.length) editor.run(() => editor.updateShapes(short.map(s => ({ id: s.id, type: GEN_TYPE, props: { h: CARD_H } }) as any)), { history: 'ignore' });
    registerLinkPreviews(editor); registerFileDrops(editor, toast); const unLinks = registerLinkCleanup(editor);
    setBoardCtx({ boardId: id, projectId: board.projectId ?? null, editor }); exposeForDev(editor);
    editor.run(() => { editor.setStyleForNextShapes(DefaultColorStyle, 'orange'); editor.setStyleForNextShapes(DefaultFontStyle, 'sans'); });
    const save = async () => {
      if (!dirty || saving || stopped) return; dirty = false; saving = true; onSaveState('saving');
      try { const r = await saveBoard(id, getSnapshot(editor.store).document, rev); rev = r.rev; onSaved(r); if (!dirty) onSaveState('saved'); }
      catch (e) { if (e instanceof BoardError && e.code === 'rev_conflict') { stopped = true; onSaveState('conflict'); toast('This board changed in another tab. Reload to get the latest; changes here are not saved.', 'warn', { ms: 8000 }); }
        else if (e instanceof BoardError && e.status === 404) { stopped = true; }
        else { dirty = true; onSaveState('error'); timer = window.setTimeout(save, 4000); } }
      finally { saving = false; if (dirty && !stopped) schedule(); }
    };
    const schedule = () => { clearTimeout(timer); timer = window.setTimeout(save, 800); };
    const unDoc = editor.store.listen(() => { dirty = true; onSaveState('saving'); schedule(); }, { scope: 'document', source: 'user' });
    const unCam = editor.store.listen(() => { clearTimeout(camTimer); camTimer = window.setTimeout(() => writeCam(id, editor.getCamera()), 400); }, { scope: 'session' });
    const onHide = () => { if (document.visibilityState === 'hidden') { writeCam(id, editor.getCamera()); void save(); } };
    const onExit = () => { writeCam(id, editor.getCamera()); if (dirty && !stopped && saveBoardOnExit(id, getSnapshot(editor.store).document, rev)) dirty = false; };
    document.addEventListener('visibilitychange', onHide); addEventListener('pagehide', onExit);
    const unHand = bindHand(editor); /* the agent's cursor, outline and laser never outlive the board */
    return () => { unHand(); unLinks(); unDoc(); unCam(); clearTimeout(timer); clearTimeout(camTimer); document.removeEventListener('visibilitychange', onHide); removeEventListener('pagehide', onExit);
      writeCam(id, editor.getCamera()); if (dirty && !stopped) { const snap = getSnapshot(editor.store).document; void saveBoard(id, snap, rev).then(onSaved).catch(() => saveBoardOnExit(id, snap, rev)); } };
  };

  return <div className="cv-board" data-testid="cv-board">
    <Tldraw key={board.id} snapshot={snapshot} getShapeVisibility={linkArrowVisibility as any} shapeUtils={SHAPE_UTILS} themes={THEMES} colorScheme="dark" components={COMPONENTS} options={OPTIONS} assets={assetStore} onMount={onMount} overrides={OVERRIDES}
      licenseKey={(import.meta as any).env?.VITE_TLDRAW_LICENSE_KEY || undefined}>
      <LeftToolbar />
      <EmptyHint onOpenAssets={() => setDrawerOpen(true)} />
      <CardKeys />
      <OverviewZoom />
      <FollowAgent />
      <NextStepMenu />
      <CameraMotion />
      <AssetsDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} projectId={board.projectId ?? null} onProject={onProject} />
    </Tldraw>
    {view3d && <Suspense fallback={null}><Viewer3D item={view3d} onClose={close3d} /></Suspense>}
  </div>;
}
