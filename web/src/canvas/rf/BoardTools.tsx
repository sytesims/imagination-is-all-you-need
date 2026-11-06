/**
 * The React Flow board's interactions (Canvas release 1, phase 4): our own code, no React Flow Pro.
 *  - copy / cut / paste through the browser's clipboard events (app JSON, clipboard.ts), Paste in the menu from this tab's last copy;
 *  - the right-click menu (Copy, Paste, Duplicate, Tidy, Group, Delete) and the shortcuts sheet (?);
 *  - the magnet: drop a card near a compatible card's side and it clicks in and links; pull it away and the snapped link lets go
 *    (LinkLayer's magnetCheck / magnetDrop over links.snapTarget; drawn here in board coordinates);
 *  - drops: files from the computer, Assets items and links, onto a card's port (it glows when it can take it), onto a card, or onto the
 *    empty board; a filled port asks first (Replace and rerun · Replace only · Add as a new card).
 * The word is "Group", never "Frame" (Start / End / Key frames are something else).
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ViewportPortal } from '@xyflow/react';
import { atom, useValue, type BoardApi, type NodeId, type Point } from '../boardApi';
import { useToast } from '../../shared/Toast';
import { uploadMedia } from '../../shared/batch1';
import { pictureName } from '../../../../server/src/shared/canvasPictures';
import { GEN_TYPE, UPLOAD_TYPE, NODE_DEFS, isNodeType } from '../nodeTypes';
import { cardState } from '../cardState';
import { catalogNow } from '../catalog';
import { createAuxNode } from '../auxShapes';
import { freeSpot } from '../placement';
import { planFileDrop, uploadedInput, mediaPoster } from '../fileDrop';
import { addCardInputs } from '../agentApi';
import { removeCardInput } from '../CardInputs';
import { lineageOf } from '../graph';
import { quoteNode } from '../nodeRun';
import { usdOfQuote } from '../priceLock';
import { boardCtx } from '../boardCtx';
import { magnetAtom, tidyNow, Magnet } from '../LinkLayer';
import { reducedMotion } from '../agentHand';
import { LINK_CARD_TYPE } from '../../../../server/src/shared/boardDoc';
import type { BoardInput } from '../cardModel';
import { copyClip, clipText, readClip, pasteClip, rememberClip, memoryClip, nextPasteOffset, duplicateSelection, type Clip } from './clipboard';
import { dropKindAtom, kindOfType, asUrl, urlPlan, portDropPlan, choiceForKey, rerunIds, wrongKindText, type DropChoice, type MediaKind } from './portDrop';
import type { PortKind } from '../nodeLogic';

type Toast = ReturnType<typeof useToast>;
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
export const MOD = isMac ? '⌘' : 'Ctrl+';
const typing = (t: EventTarget | null) => { const el = t as HTMLElement | null; return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || !!el.closest?.('[role=dialog],.apop,.cv-agent-slot')); };

// ---------------------------------------------------------------- the board's own actions (keys, menu)
/** The last place the pointer was over the board (page px): where a paste lands. */
let lastPointer: Point | null = null;
export function boardActions(board: BoardApi, toast: Toast) {
  const nodeSel = () => board.selection().filter((id) => board.getNode(id));
  const copy = (cut = false): boolean => { const c = copyClip(board, nodeSel()); if (!c) return false; rememberClip(c);
    if (cut) { board.mark('cut'); board.removeNodes(c.nodes.filter((n) => !n.parent).map((n) => n.id as NodeId)); }
    return true; };
  const paste = (c: Clip | null = memoryClip(), at?: Point | null) => { if (!c) { toast('Nothing to paste yet. Copy cards first.', 'info'); return; }
    const spot = at ?? null; const ids = spot ? pasteClip(board, c, { at: spot }) : pasteClip(board, c, { offset: nextPasteOffset() });
    const n = Object.keys(ids).length; if (n) toast(`Pasted ${n} card${n === 1 ? '' : 's'}`); };
  const remove = () => { const sel = board.selection(); const nodes = sel.filter((id) => board.getNode(id)), links = sel.filter((id) => board.getLink(id)); if (!sel.length) return;
    board.mark('delete'); board.batch(() => { board.removeLinks(links); board.removeNodes(nodes); }); };
  const duplicate = () => { const ids = duplicateSelection(board); if (!ids.length) toast('Select cards to duplicate.', 'info'); };
  const tidy = () => { const n = tidyNow(board); toast(n ? `Tidied ${n} card${n === 1 ? '' : 's'}` : 'Already tidy'); };
  const group = () => { if (!nodeSel().some((id) => isNodeType(board.getNode(id)?.type))) { toast('Select cards to group.', 'info'); return; } createAuxNode(board, 'group'); };
  const selectAll = () => board.select(board.nodes().filter((n) => !board.parentOf(n.id)).map((n) => n.id));
  return { copy, paste, remove, duplicate, tidy, group, selectAll };
}

/** ⌘C / ⌘X / ⌘V through the browser's clipboard events (the system clipboard, no permission prompt), and a pasted link or file. */
export function useClipboardEvents(board: BoardApi, el: () => HTMLElement | null, toast: Toast, onFiles: (files: File[], at: Point) => void) {
  useEffect(() => {
    const track = (e: PointerEvent) => { const r = el()?.getBoundingClientRect(); if (r && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) lastPointer = board.screenToBoard({ x: e.clientX, y: e.clientY }); };
    const act = boardActions(board, toast);
    const onCopy = (e: ClipboardEvent, cut: boolean) => { if (typing(e.target) || (getSelection()?.toString() ?? '')) return; const c = copyClip(board, board.selection().filter((id) => board.getNode(id))); if (!c) return;
      e.preventDefault(); e.clipboardData?.setData('text/plain', clipText(c)); act.copy(cut); };
    const copy = (e: ClipboardEvent) => onCopy(e, false), cut = (e: ClipboardEvent) => onCopy(e, true);
    const paste = (e: ClipboardEvent) => {
      if (typing(e.target)) return; const dt = e.clipboardData; if (!dt) return; const at = lastPointer ?? board.viewportBounds().center;
      const files = [...(dt.files ?? [])]; if (files.length) { e.preventDefault(); onFiles(files, at); return; }
      const text = dt.getData('text/plain'); const c = readClip(text);
      if (c) { e.preventDefault(); rememberClip(c); act.paste(c, lastPointer); return; }
      const u = asUrl(text); if (u) { e.preventDefault(); void addFromUrl(board, u, at, toast); return; }
    };
    addEventListener('pointermove', track, { passive: true }); document.addEventListener('copy', copy); document.addEventListener('cut', cut); document.addEventListener('paste', paste);
    return () => { removeEventListener('pointermove', track); document.removeEventListener('copy', copy); document.removeEventListener('cut', cut); document.removeEventListener('paste', paste); };
  }, [board, el, toast, onFiles]);
}

// ---------------------------------------------------------------- links and media from a URL
/** A pasted or dropped link: a picture / clip / sound it points straight at comes in as an Upload node (fetched here, then uploaded); any
 *  other page becomes a Link card with its title and picture (our /api/canvas/unfurl reads it server side). */
export async function addFromUrl(board: BoardApi, url: string, at: Point, toast: Toast): Promise<string | null> {
  const plan = urlPlan(url);
  if (plan.as === 'media') {
    try { const r = await fetch(url); if (!r.ok) throw new Error(String(r.status)); const blob = await r.blob(); const name = decodeURIComponent(new URL(url).pathname.split('/').pop() || 'file');
      const [m] = await uploadMedia([new File([blob], name, { type: blob.type })]); if (!m?.url) throw new Error('upload');
      const { defaultW: w, defaultH: h } = NODE_DEFS.upload;
      return createAuxNode(board, 'upload', { at: freeSpot(board, w, h, at), media: { url: m.url, poster: mediaPoster(plan.kind, m.url), mediaKind: plan.kind, label: pictureName(name, 'Upload') } }); }
    catch { toast('That file can’t be brought in from its site, so it’s a link card instead.', 'info'); }
  }
  const meta: any = await fetch(`/api/canvas/unfurl?url=${encodeURIComponent(url)}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  let host = url; try { host = new URL(url).hostname.replace(/^www\./, ''); } catch { /* keep it */ }
  board.mark('paste link'); let id = '';
  board.batch(() => { id = board.addNode({ type: LINK_CARD_TYPE, x: Math.round(at.x - 150), y: Math.round(at.y - 160), props: { w: 300, h: meta?.image ? 320 : 150, url, title: meta?.title || host, description: meta?.description ?? '', image: meta?.image ?? '', favicon: meta?.favicon ?? '' } }); });
  board.select([id]); return id;
}

// ---------------------------------------------------------------- drops onto a port
/** What is dropped on a port: a file still to upload, or media that already has a URL (an Assets item). */
export type Dropped = { kind: MediaKind | null; name: string; file?: File; url?: string; poster?: string; jobId?: string };
interface PortRef { cardId: string; slot: string; kind: PortKind; filled: boolean; label: string; el: HTMLElement }
/** The input port under a screen point (poster ports carry data-slot and sit inside the card's data-shape-id). */
export function portAt(x: number, y: number): PortRef | null {
  const el = (document.elementFromPoint(x, y) as HTMLElement | null)?.closest?.('.pc-port.pc-in[data-slot]') as HTMLElement | null; if (!el) return null;
  const cardId = el.closest('[data-shape-id]')?.getAttribute('data-shape-id'); if (!cardId) return null;
  return { cardId, slot: el.dataset.slot!, kind: el.dataset.kind as PortKind, filled: el.classList.contains('filled'), label: el.dataset.label ?? '', el };
}
/** The menu and the "takes a picture" bubble. */
type DropUi = { type: 'menu'; x: number; y: number; port: Omit<PortRef, 'el'>; item: Dropped; after: number; usd: number | null | undefined } | { type: 'bubble'; x: number; y: number; text: string; at: number };
export const dropUiAtom = atom<DropUi | null>('ohf-drop-ui', null);
const shake = (el: HTMLElement) => { if (reducedMotion()) return; el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); setTimeout(() => el.classList.remove('shake'), 650); };

async function inputOf(d: Dropped, toast: Toast): Promise<BoardInput | null> {
  if (d.url) return { key: `a:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, kind: d.kind as any, url: d.url, poster: d.poster ?? mediaPoster(d.kind!, d.url), jobId: d.jobId ?? '', label: d.name };
  if (!d.file) return null;
  try { const [m] = await uploadMedia([d.file]); if (!m?.url) throw new Error('Upload failed'); return uploadedInput(d.kind as any, m.url, d.file.name); }
  catch (e) { toast((e as Error).message || 'Upload failed', 'error'); return null; }
}
/** Something was dropped on a port: refuse the wrong kind (shake + bubble), fill an empty port, or ask on a filled one. */
export function dropOnPort(board: BoardApi, port: PortRef, d: Dropped, at: { x: number; y: number }, toast: Toast) {
  const card = board.getNode(port.cardId); if (!card) return;
  if ((card.props as any).status === 'running') { dropUiAtom.set({ type: 'bubble', x: at.x, y: at.y, text: 'This card is running. Drop it again when it’s done.', at: Date.now() }); return; }
  const plan = portDropPlan(port, d.kind);
  if (plan.do === 'refuse') { shake(port.el); dropUiAtom.set({ type: 'bubble', x: at.x, y: at.y, text: plan.why, at: Date.now() }); return; }
  if (plan.do === 'fill') { void (async () => { const inp = await inputOf(d, toast); if (!inp || !board.getNode(port.cardId)) return; board.mark('drop on a port'); addCardInputs(board, port.cardId as NodeId, [{ input: inp, slot: port.slot }]); })(); return; }
  const after = afterIds(board, port.cardId); const { el: _el, ...p } = port;
  dropUiAtom.set({ type: 'menu', x: at.x, y: at.y, port: p, item: d, after: after.length - 1, usd: undefined });
  /* the menu's price: this card and every card after it, quoted as they are now (null: can't price) */
  void Promise.all(after.map((id) => quoteNode(board, id as NodeId).catch(() => null))).then((qs) => { const cur = dropUiAtom.get(); if (cur?.type !== 'menu' || cur.port.cardId !== port.cardId) return;
    const usds = qs.map(usdOfQuote); dropUiAtom.set({ ...cur, usd: usds.some((u) => u == null) ? null : usds.reduce((a, b) => a! + b!, 0) }); });
}
const afterIds = (board: BoardApi, cardId: string) => rerunIds(cardId, lineageOf(board, cardId)?.desc ?? [], (id) => board.getNode(id)?.type === GEN_TYPE);

/** The menu's choice. Replace swaps what fills the slot (one undo step); Rerun then makes a proposal (prices first, it waits for Go). */
export async function applyDropChoice(board: BoardApi, ui: Extract<DropUi, { type: 'menu' }>, choice: DropChoice, toast: Toast) {
  dropUiAtom.set(null); const { port, item } = ui; const card = board.getNode(port.cardId); if (!card) return;
  if (choice === 'new') {
    const b = board.boundsOf(port.cardId); const { defaultW: w, defaultH: h } = NODE_DEFS.upload; const near = b ? { x: b.minX - w / 2 - 80, y: b.maxY + h / 2 + 40 } : board.viewportBounds().center;
    const inp = await inputOf(item, toast); if (!inp) return;
    createAuxNode(board, 'upload', { at: freeSpot(board, w, h, near), media: { url: inp.url, poster: inp.poster, mediaKind: inp.kind as any, label: pictureName(item.name, 'Upload') } }); return;
  }
  const inp = await inputOf(item, toast); if (!inp || !board.getNode(port.cardId)) return;
  const st = cardState(board, board.getNode(port.cardId)!, catalogNow()); const old = st.bySlot[port.slot] ?? [];
  board.mark('replace input'); board.batch(() => { for (const i of old) removeCardInput(board, port.cardId as NodeId, i); addCardInputs(board, port.cardId as NodeId, [{ input: inp, slot: port.slot }]); });
  if (choice !== 'rerun') { toast(`Replaced ${port.label || 'the input'}`); return; }
  const ids = afterIds(board, port.cardId); const boardId = boardCtx().boardId;
  const r = await fetch(`/api/canvas/boards/${encodeURIComponent(boardId)}/agent/proposals`, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ card_ids: ids.slice(0, 20), note: `Replace and rerun: ${ids.length === 1 ? 'this card' : `this card + ${ids.length - 1} after it`}` }) }).catch(() => null);
  const b = r ? await r.json().catch(() => null) : null;
  if (!r?.ok) toast(b?.error ?? 'Replaced. The rerun couldn’t be priced; press Go on the card when you’re ready.', 'warn');
  else toast('Replaced. The rerun is priced in the AI panel: press Go there when it looks right.');
}

/** The drop menu and the bubble, at the pointer (screen px). ↵ ⇧ ⌥ pick; Esc or a click away closes. */
export function DropUiLayer({ board }: { board: BoardApi }) {
  const toast = useToast(); const ui = useValue('drop ui', () => dropUiAtom.get(), []);
  useEffect(() => { if (!ui) return; if (ui.type === 'bubble') { const t = setTimeout(() => { if (dropUiAtom.get() === ui) dropUiAtom.set(null); }, 1800); return () => clearTimeout(t); }
    const k = (e: KeyboardEvent) => { const c = choiceForKey(e); if (!c) return; e.preventDefault(); e.stopPropagation(); if (c === 'cancel') dropUiAtom.set(null); else void applyDropChoice(board, ui, c, toast); };
    const away = (e: PointerEvent) => { if (!(e.target as HTMLElement)?.closest?.('.cv-dropmenu')) dropUiAtom.set(null); };
    addEventListener('keydown', k, true); addEventListener('pointerdown', away, true); return () => { removeEventListener('keydown', k, true); removeEventListener('pointerdown', away, true); }; }, [ui, board, toast]);
  if (!ui) return null;
  if (ui.type === 'bubble') return <div className="cv-dropbubble" style={{ left: ui.x, top: ui.y }} role="status" data-testid="drop-bubble">{ui.text}</div>;
  const price = ui.usd === undefined ? 'pricing…' : ui.usd == null ? 'priced next' : `≈ $${ui.usd.toFixed(2)}`;
  const row = (c: DropChoice, label: string, hint: string, key: string) => <button type="button" role="menuitem" className="cv-dm-row" data-testid={`drop-${c}`} onClick={() => void applyDropChoice(board, ui, c, toast)}>
    <span className="cv-dm-t"><b>{label}</b><small>{hint}</small></span><kbd>{key}</kbd></button>;
  return <div className="cv-dropmenu cv-ctx" role="menu" aria-label={`Drop on ${ui.port.label}`} style={{ left: ui.x, top: ui.y }} data-testid="drop-menu">
    <p className="cv-ctx-h">{ui.port.label || 'This input'} is filled</p>
    {row('rerun', 'Replace and rerun', `${ui.after ? `This card + ${ui.after} after it` : 'This card'} · ${price} · asks first`, '↵')}
    {row('replace', 'Replace only', 'Nothing runs', '⇧')}
    {row('new', 'Add as a new card', 'Keeps this input as it is', '⌥')}
  </div>;
}

// ---------------------------------------------------------------- file drops on the board
/** Files dragged in from the computer: ports glow while they're over the board; dropped on a port, a card, or the empty board. */
export function useFileDrops(board: BoardApi, el: () => HTMLElement | null, toast: Toast) {
  const onFiles = useRef<(files: File[], at: Point, screen?: { x: number; y: number }) => void>(() => undefined);
  onFiles.current = (files, at, screen) => {
    const port = screen ? portAt(screen.x, screen.y) : null;
    if (port && files.length === 1) { dropOnPort(board, port, { kind: kindOfType(files[0].type, files[0].name), name: files[0].name, file: files[0] }, screen!, toast); return; }
    void dropFilesAt(board, files, at, toast);
  };
  useEffect(() => { const root = el(); if (!root) return;
    const kindsOf = (dt: DataTransfer | null): MediaKind[] => [...new Set([...(dt?.items ?? [])].filter((i) => i.kind === 'file').map((i) => kindOfType(i.type)).filter(Boolean) as MediaKind[])];
    const has = (dt: DataTransfer | null) => !!dt && [...dt.types].some((t) => t === 'Files' || t === 'text/uri-list');
    const over = (e: DragEvent) => { if (!has(e.dataTransfer)) return; e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'; const k = kindsOf(e.dataTransfer); const cur = dropKindAtom.get();
      if (!cur || cur.kinds.join() !== k.join()) dropKindAtom.set({ kinds: k }); };
    const leave = (e: DragEvent) => { if (!root.contains(e.relatedTarget as Node | null)) dropKindAtom.set(null); };
    const drop = (e: DragEvent) => { if (!has(e.dataTransfer)) return; e.preventDefault(); dropKindAtom.set(null); const at = board.screenToBoard({ x: e.clientX, y: e.clientY });
      const files = [...(e.dataTransfer?.files ?? [])]; if (files.length) { onFiles.current(files, at, { x: e.clientX, y: e.clientY }); return; }
      const u = asUrl(e.dataTransfer?.getData('text/uri-list')?.split('\n').find((l) => l && !l.startsWith('#')) ?? e.dataTransfer?.getData('text/plain'));
      if (u) void addFromUrl(board, u, at, toast); };
    root.addEventListener('dragover', over); root.addEventListener('dragleave', leave); root.addEventListener('drop', drop);
    return () => { root.removeEventListener('dragover', over); root.removeEventListener('dragleave', leave); root.removeEventListener('drop', drop); dropKindAtom.set(null); }; }, [board, el, toast]);
  const stable = useRef((files: File[], at: Point) => onFiles.current(files, at)); return stable.current;
}
/** Files on a card (not on a port) or the empty board: as on the classic board (fileDrop.ts plan): a card takes them in its free slots,
 *  the rest become Upload nodes near the drop, named after their files. */
export async function dropFilesAt(board: BoardApi, files: File[], at: Point, toast: Toast) {
  const hit = board.nodesAt(at).find((n) => n.type === GEN_TYPE || n.type === UPLOAD_TYPE) ?? null; if (hit?.type === UPLOAD_TYPE) return;
  const st = hit ? cardState(board, hit, catalogNow()) : null; const slots = st?.spec?.slots ?? [];
  const plan = planFileDrop(files, slots, Object.fromEntries(slots.map((x) => [x.name, st!.bySlot[x.name]?.length ?? 0])));
  const loose = hit && files.length === 1 ? [] : plan.rest.filter((r) => r.kind); for (const r of plan.rest) if (!loose.includes(r)) toast(r.why, 'warn');
  const up = async (i: number) => { try { const [m] = await uploadMedia([files[i]]); if (!m?.url) throw new Error('Upload failed'); return m.url; } catch (e) { toast((e as Error).message || 'Upload failed', 'error'); return null; } };
  const [fillUrls, looseUrls] = await Promise.all([Promise.all(plan.fills.map((f) => up(f.file))), Promise.all(loose.map((r) => up(r.file)))]);
  const filled = plan.fills.flatMap((f, i) => (fillUrls[i] ? [{ input: uploadedInput(f.kind, fillUrls[i]!, files[f.file].name), slot: f.slot }] : []));
  if (hit && filled.length && board.getNode(hit.id)) { board.mark('drop files'); addCardInputs(board, hit.id, filled); }
  const { defaultW: w, defaultH: h } = NODE_DEFS.upload; const made: string[] = [];
  loose.forEach((r, i) => { const url = looseUrls[i]; if (!url) return; const card = hit && board.boundsOf(hit.id); const near = card ? { x: at.x, y: card.maxY + h / 2 + 40 } : at;
    made.push(createAuxNode(board, 'upload', { at: freeSpot(board, w, h, near), select: false, media: { url, poster: mediaPoster(r.kind!, url), mediaKind: r.kind!, label: pictureName(files[r.file].name, 'Upload') } })); });
  if (made.length) board.select(made);
}

/** Assets drawer drags (pointer based) onto a port: AssetsDrawer asks this while it drags and when it lets go. */
export const assetPortDrop = {
  over(kind: MediaKind | null) { const cur = dropKindAtom.get(); if (!kind) { if (cur) dropKindAtom.set(null); return; } if (!cur || cur.kinds.join() !== kind) dropKindAtom.set({ kinds: [kind] }); },
  /** true when it landed on a port (handled here) */
  drop(board: BoardApi, x: number, y: number, d: Dropped, toast: Toast): boolean { dropKindAtom.set(null); const port = portAt(x, y); if (!port) return false; dropOnPort(board, port, d, { x, y }, toast); return true; },
};

// ---------------------------------------------------------------- the right-click menu and the shortcuts sheet
type Ctx = { x: number; y: number; on: 'node' | 'pane'; at: Point };
export const ctxAtom = atom<Ctx | null>('ohf-rf-ctx', null);
export const sheetAtom = atom<boolean>('ohf-rf-keys', false);
export function ContextMenu({ board }: { board: BoardApi }) {
  const toast = useToast(); const ctx = useValue('rf ctx', () => ctxAtom.get(), []); const box = useRef<HTMLDivElement>(null); const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => { if (!ctx) return; const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) ctxAtom.set(null); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); ctxAtom.set(null); } };
    addEventListener('pointerdown', away, true); addEventListener('keydown', esc, true); return () => { removeEventListener('pointerdown', away, true); removeEventListener('keydown', esc, true); }; }, [ctx]);
  /* keep it on screen (390 px wide phones too) */
  useEffect(() => { if (!ctx) { setPos(null); return; } const r = box.current?.getBoundingClientRect(); const w = r?.width ?? 240, h = r?.height ?? 300;
    setPos({ x: Math.max(8, Math.min(ctx.x, innerWidth - w - 8)), y: Math.max(8, Math.min(ctx.y, innerHeight - h - 8)) }); }, [ctx]);
  if (!ctx) return null;
  const a = boardActions(board, toast); const sel = board.selection().filter((id) => board.getNode(id)); const has = sel.length > 0; const close = () => ctxAtom.set(null);
  const item = (id: string, label: string, keys: string, run: () => void, o: { off?: boolean; danger?: boolean } = {}): ReactNode =>
    <button type="button" role="menuitem" className={`cv-ctx-row${o.danger ? ' danger' : ''}`} data-testid={`ctx-${id}`} disabled={o.off} onClick={() => { close(); run(); }}><span>{label}</span><kbd>{keys}</kbd></button>;
  return <div ref={box} className="cv-ctx" role="menu" aria-label={ctx.on === 'node' ? 'Card actions' : 'Board actions'} data-testid="rf-context-menu" data-on={ctx.on}
    style={{ left: pos?.x ?? ctx.x, top: pos?.y ?? ctx.y, visibility: pos ? 'visible' : 'hidden' }} onContextMenu={(e) => e.preventDefault()}>
    {ctx.on === 'node' && <p className="cv-ctx-h">{sel.length === 1 ? '1 card' : `${sel.length} cards`}</p>}
    {ctx.on === 'node' && item('copy', 'Copy', `${MOD}C`, () => a.copy(), { off: !has })}
    {item('paste', 'Paste', `${MOD}V`, () => a.paste(memoryClip(), ctx.on === 'pane' ? ctx.at : null), { off: !memoryClip() })}
    {ctx.on === 'node' && item('duplicate', 'Duplicate', `${MOD}D`, a.duplicate, { off: !has })}
    <i className="cv-ctx-sep" />
    {item('tidy', 'Tidy', '⇧T', a.tidy)}
    {ctx.on === 'node' && item('group', 'Group', `${MOD}G`, a.group, { off: !has })}
    {ctx.on === 'pane' && item('select-all', 'Select all', `${MOD}A`, a.selectAll)}
    {ctx.on === 'node' && <><i className="cv-ctx-sep" />{item('delete', 'Delete', '⌫', a.remove, { off: !has, danger: true })}</>}
    <i className="cv-ctx-sep" />
    {item('keys', 'Keyboard shortcuts', '?', () => sheetAtom.set(true))}
  </div>;
}
const KEYS: [string, string][] = [['G', 'New card'], ['Enter', 'Run the selected card (asks first when its price changed)'], [`${MOD}C`, 'Copy'], [`${MOD}X`, 'Cut'], [`${MOD}V`, 'Paste (cards, files or a link)'],
  [`${MOD}D`, 'Duplicate'], [`${MOD}G`, 'Group the selection'], ['⇧T', 'Tidy the board'], [`${MOD}A`, 'Select all'], ['⌫', 'Delete'], [`${MOD}Z`, 'Undo'], [`⇧${MOD}Z`, 'Redo'],
  ['V', 'Select tool'], ['H', 'Hand tool'], ['Esc', 'Clear the selection'], ['?', 'This sheet']];
const DROP_KEYS: [string, string][] = [['↵', 'Replace and rerun (prices first)'], ['⇧', 'Replace only'], ['⌥', 'Add as a new card']];
export function ShortcutsSheet() {
  const open = useValue('rf keys sheet', () => sheetAtom.get(), []);
  useEffect(() => { if (!open) return; const k = (e: KeyboardEvent) => { if (e.key === 'Escape' || e.key === '?') { e.preventDefault(); e.stopPropagation(); sheetAtom.set(false); } }; addEventListener('keydown', k, true); return () => removeEventListener('keydown', k, true); }, [open]);
  if (!open) return null;
  return <div className="cv-keys-back" onPointerDown={(e) => { if (e.target === e.currentTarget) sheetAtom.set(false); }}>
    <section className="cv-keys" role="dialog" aria-label="Keyboard shortcuts" data-testid="rf-shortcuts">
      <header><h2>Keyboard shortcuts</h2><button type="button" className="cv-icon-btn" aria-label="Close" onClick={() => sheetAtom.set(false)}>✕</button></header>
      <div className="cv-keys-cols">
        <dl>{KEYS.map(([k, t]) => <div key={k}><dt><kbd>{k}</kbd></dt><dd>{t}</dd></div>)}</dl>
        <div><h3>Dropping on a filled input</h3><dl>{DROP_KEYS.map(([k, t]) => <div key={k}><dt><kbd>{k}</kbd></dt><dd>{t}</dd></div>)}</dl>
          <p className="cv-keys-note">Right-click a card or the board for the same actions. Drag a card next to another and it snaps in and links; pull it away to let go.</p></div>
      </div>
    </section>
  </div>;
}

// ---------------------------------------------------------------- the magnet (drawn in board coordinates)
export function MagnetLayer({ board }: { board: BoardApi }) {
  const m = useValue('rf magnet', () => magnetAtom.get(), []);
  const t = m ? board.boundsOf(m.target as NodeId) : null;
  return <>
    <Magnet />
    {m && t && <ViewportPortal><svg className="cv-rf-magnet" aria-hidden data-testid="link-magnet" style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none' }}>
      {(() => { const x = m.to === m.target ? t.x - 50 : t.maxX + 50; return <g className="lk-magnet"><line x1={x} y1={t.y + 40} x2={x} y2={t.maxY - 40} /><circle cx={x} cy={t.midY} r={10} /></g>; })()}
    </svg></ViewportPortal>}
  </>;
}
