/**
 * /canvas: an infinite board to sketch and arrange image, video, audio and 3D results (the board engine is lazy-loaded with this page only).
 * The page picks a board (?board=<id>, else the last one opened here, else the newest, else a new "Untitled board 1"), shows the
 * board switcher top left (New board, rename, delete with a confirm) and the Assets button top right. Board.tsx draws the board.
 * The AI dock (AgentPanel) sits on the left, 380 px, open by default; the board fills the rest and builds live as the agent works,
 * with a Follow agent toggle in the top bar.
 */
import { lazy, Suspense, useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { navigate, useSearch } from '../platform/router';
import { BarPopover, PopSection, PopRow } from '../shared/BarPop';
import { askConfirm, askText } from '../shared/Dialog';
import { useToast } from '../shared/Toast';
import { Skeleton } from '../shared/Skeleton';
import { listBoards, createBoard, getBoard, renameBoard, deleteBoard, setBoardProject, setBoardBudget, type Board as BoardDoc, type BoardSummary } from './boardsApi';
import { Board, type SaveState } from './Board';
import { AgentPanel } from './AgentPanel';
import { SpendChip, BUDGET_EVT, BUDGET_ASK_EVT } from './SpendChip';
import { OPEN_DOCK_EVT } from './flowRun';
import { CoinIcon } from './icons';
import { FollowToggle } from './FollowAgent';
import { DOCK_W } from './agentDockModel';
import { useValue, BoardProvider, type BoardApi } from './boardApi';
import { CardPanel } from './CardPanel'; /* MOCKUP: the card panel */
import { BOARD_LOOKS, boardLookAtom, setBoardLook } from './boardLook';
import { BoardIcon, ChevronIcon, PanelIcon } from './icons';
import { PlusIcon, PencilIcon, TrashIcon, SparkleIcon } from '../ui/Icons';
import { canvasEngine, engineInUrl, saveEngine, savedEngine, type CanvasEngine } from './rf/engine';
import './canvas.css';
import './generate.css';
import './node.css';

/* the React Flow engine (behind the switch, rf/engine.ts): its own chunk, loaded only when it is on */
const RfBoard = lazy(() => import('./rf/RfBoard'));
const LAST = 'ohf-canvas-last-board';
const AGENT_OPEN = 'ohf-canvas-dock-open'; /* the left dock (2026-10-26): a new key, so everyone starts with it open */
const readLast = () => { try { return localStorage.getItem(LAST); } catch { return null; } };
const writeLast = (id: string) => { try { localStorage.setItem(LAST, id); } catch { /* private window */ } };
const readAgentOpen = () => { try { const v = localStorage.getItem(AGENT_OPEN); if (v != null) return v === '1'; return typeof window === 'undefined' ? true : window.innerWidth >= 760; } catch { return true; } };
const writeAgentOpen = (v: boolean) => { try { localStorage.setItem(AGENT_OPEN, v ? '1' : '0'); } catch { /* private window */ } };
const ago = (t: number) => { const s = Math.max(0, (Date.now() - t) / 1000); return s < 60 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : new Date(t).toLocaleDateString(); };
const SAVE_TEXT: Record<SaveState, string> = { saved: 'Saved', saving: 'Saving…', error: 'Not saved yet, retrying', conflict: 'Changed in another tab' };

/** Keeps the board below the app header: the header's height can change (announce bar, fold), so measure it. */
function useHeaderBottom() {
  const [box, setBox] = useState({ top: 56, bottom: 0 });
  useEffect(() => { const m = () => {
      const vis = (sel: string) => [...document.querySelectorAll<HTMLElement>(sel)].map(el => el.getBoundingClientRect()).filter(r => r.height > 0);
      const top = Math.max(0, ...vis('header.topnav, .m-top').map(r => r.bottom)); const tabs = vis('.m-tabs')[0]; /* the phone tab bar */
      setBox({ top: Math.round(top), bottom: tabs ? Math.max(0, Math.round(innerHeight - tabs.top)) : 0 }); };
    m(); const ro = new ResizeObserver(m); document.querySelectorAll('header.topnav, .m-top, .m-tabs').forEach(el => ro.observe(el)); addEventListener('resize', m); addEventListener('scroll', m, { passive: true });
    return () => { ro.disconnect(); removeEventListener('resize', m); removeEventListener('scroll', m); }; }, []);
  return box;
}

function BoardSwitcher({ boards, current, save, onPick, onNew, onRename, onDelete, onBudget }: { boards: BoardSummary[]; current: BoardSummary; save: SaveState;
  onPick: (id: string) => void; onNew: () => void; onRename: () => void; onDelete: () => void; onBudget: () => void }) {
  const btn = useRef<HTMLButtonElement>(null); const [open, setOpen] = useState(false); const run = (f: () => void) => () => { setOpen(false); f(); };
  return <div className="cv-switch">
    <button ref={btn} type="button" className="cv-switch-btn" aria-haspopup="dialog" aria-expanded={open} data-testid="cv-switch" onClick={() => setOpen(o => !o)}>
      <BoardIcon size={16} /><span className="cv-switch-t"><b data-testid="cv-board-name">{current.name}</b><small data-testid="cv-save" data-state={save}>{SAVE_TEXT[save]}</small></span><ChevronIcon size={14} />
    </button>
    <BarPopover open={open} anchor={btn} onClose={() => setOpen(false)} label="Boards" placement="bottom" width={300} testId="cv-switch-pop">
      <PopSection label="Boards" aside={`${boards.length}`}>
        <div className="cv-board-list" role="listbox" aria-label="Boards">
          {boards.map(b => <PopRow key={b.id} selected={b.id === current.id} label={b.name} hint={`${b.shapes} item${b.shapes === 1 ? '' : 's'} · ${ago(b.updatedAt)}`} onClick={run(() => onPick(b.id))} testId="cv-board-row" />)}
        </div>
      </PopSection>
      <LookSection />
      <EngineSection />
      <PopSection>
        <div className="cv-board-actions" role="menu" aria-label="Board actions">
          <PopRow role="menuitem" icon={<PlusIcon size={16} />} label="New board" onClick={run(onNew)} testId="cv-board-new" />
          <PopRow role="menuitem" icon={<PencilIcon size={16} />} label="Rename this board" onClick={run(onRename)} testId="cv-board-rename" />
          <PopRow role="menuitem" icon={<CoinIcon size={16} />} label={current.budgetUsd != null ? 'Board budget' : 'Set a board budget'} hint={current.budgetUsd != null ? `$${current.budgetUsd.toFixed(2)} · only you can change it` : 'Runs that would go over it don’t start'} onClick={run(onBudget)} testId="cv-board-budget" />
          <PopRow role="menuitem" icon={<TrashIcon size={16} />} label="Delete this board" onClick={run(onDelete)} testId="cv-board-delete" className="cv-danger" />
        </div>
      </PopSection>
    </BarPopover>
  </div>;
}

/** Which engine draws the board (dev builds, or once the new one is on): Classic (tldraw) or the React Flow preview. Kept in this browser. */
function EngineSection() {
  const now = canvasEngine(); if (!(import.meta as any).env?.DEV && now !== 'rf' && savedEngine() !== 'rf') return null;
  const pick = (e: CanvasEngine) => { saveEngine(e); const q = new URLSearchParams(location.search); q.delete('engine'); location.search = q.toString(); };
  return <PopSection label="Board engine">
    <div className="cv-looks" role="radiogroup" aria-label="Board engine" data-testid="cv-engine">
      {([['tldraw', 'Classic', 'Today’s board'], ['rf', 'New (preview)', 'React Flow, being tested']] as const).map(([id, label, hint]) =>
        <button key={id} type="button" role="radio" aria-checked={now === id} className={`cv-look${now === id ? ' on' : ''}`} data-testid={`cv-engine-${id}`} title={hint} onClick={() => pick(id)}><b>{label}</b></button>)}
    </div>
  </PopSection>;
}

/** The board's background look (Space, Haze, Night), kept in this browser. */
function LookSection() {
  const look = useValue('board look', () => boardLookAtom.get(), []);
  return <PopSection label="Background">
    <div className="cv-looks" role="radiogroup" aria-label="Background" data-testid="cv-looks">
      {BOARD_LOOKS.map(l => <button key={l.id} type="button" role="radio" aria-checked={look === l.id} className={`cv-look${look === l.id ? ' on' : ''}`} data-testid={`cv-look-${l.id}`} onClick={() => setBoardLook(l.id)} title={l.hint}>
        <i className={`cv-look-sw look-${l.id}`} aria-hidden /><b>{l.label}</b></button>)}
    </div>
  </PopSection>;
}

export default function CanvasPage() {
  const search = useSearch(); const toast = useToast(); const { top, bottom } = useHeaderBottom();
  const want = new URLSearchParams(search).get('board');
  const [boards, setBoards] = useState<BoardSummary[] | null>(null); const [board, setBoard] = useState<BoardDoc | null>(null);
  const [err, setErr] = useState(''); const [save, setSave] = useState<SaveState>('saved'); const [drawer, setDrawer] = useState(false); const [ask] = useState(() => new URLSearchParams(location.search).get('ask') ?? '') /* Explore's Ask an agent: read before the board link replaces the URL */; const [agentOpen, setAgentOpen] = useState(() => readAgentOpen() || !!ask); const [agentBusy, setAgentBusy] = useState(false); const [boardApi, setBoardApi] = useState<BoardApi | null>(null); const [panelOn, setPanelOn] = useState(false);
  const [engine] = useState(canvasEngine); const [urlEngine] = useState(engineInUrl);
  const go = (id: string, replace = false) => navigate(`/canvas?board=${encodeURIComponent(id)}${urlEngine ? `&engine=${urlEngine}` : ''}`, { replace });

  const refresh = useCallback(() => listBoards().then(bs => { setBoards(bs); return bs; }), []);
  /* pick the board to open */
  useEffect(() => { let on = true; setErr('');
    (async () => {
      const bs = await refresh(); if (!on) return;
      const id = want && bs.some(b => b.id === want) ? want : (() => { const l = readLast(); return l && bs.some(b => b.id === l) ? l : bs[0]?.id; })();
      if (!id) { const nb = await createBoard(); if (!on) return; await refresh(); go(nb.id, true); return; }
      if (id !== want) { go(id, true); return; }
      if (board?.id === id) return;
      const b = await getBoard(id); if (!on) return; writeLast(id); setSave('saved'); setBoard(b);
    })().catch(e => { if (on) setErr(e?.message || 'Could not load your boards.'); });
    return () => { on = false; }; }, [want]); // eslint-disable-line react-hooks/exhaustive-deps

  const onSaved = useCallback((r: { rev: number; updatedAt: number; shapes: number }) => setBoards(bs => bs?.map(b => (b.id === board?.id ? { ...b, rev: r.rev, updatedAt: r.updatedAt, shapes: r.shapes } : b)).sort((a, b) => b.updatedAt - a.updatedAt) ?? bs), [board?.id]);
  const toggleAgent = () => { const next = !agentOpen; setAgentOpen(next); writeAgentOpen(next); };
  const toggleDrawer = () => setDrawer(d => !d);
  const onNew = async () => { try { const nb = await createBoard(); await refresh(); go(nb.id); } catch (e: any) { toast(e?.message || 'Could not make a board.', 'error'); } };
  const onRename = async () => { if (!board) return; const name = await askText({ title: 'Rename board', label: 'Name', initial: board.name, confirm: 'Rename', maxLength: 80 }); if (!name || name === board.name) return;
    try { const s = await renameBoard(board.id, name); setBoard(b => (b ? { ...b, name: s.name } : b)); await refresh(); } catch (e: any) { toast(e?.message || 'Could not rename the board.', 'error'); } };
  /* the board budget (release 1): only the person sets it, here; an empty answer removes it */
  const onBudget = async () => { if (!board) return; const was = current?.budgetUsd ?? null;
    const t = await askText({ title: 'Board budget', label: 'Most this board may spend, in dollars (leave empty for no budget)', placeholder: '5.00', initial: was != null ? was.toFixed(2) : '', confirm: 'Save budget', maxLength: 12 });
    if (t == null) return; const raw = t.replace(/^[$\s]+/, '').trim(); const usd = raw === '' ? null : Number(raw.replace(',', '.'));
    if (usd != null && (!Number.isFinite(usd) || usd < 0)) { toast('Type an amount in dollars, like 5 or 12.50.', 'warn'); return; }
    try { const r = await setBoardBudget(board.id, usd); setBoards(bs => bs?.map(b => (b.id === board.id ? { ...b, budgetUsd: r.budget?.usd ?? null } : b)) ?? bs); dispatchEvent(new Event(BUDGET_EVT));
      toast(r.budget ? `Board budget set: $${r.budget.usd.toFixed(2)}` : 'Board budget removed'); }
    catch (e: any) { toast(e?.message || 'Could not set the budget.', 'error'); } };
  const onProject = async (pid: string | null) => { if (!board) return; const was = board.projectId ?? null; setBoard(b => (b ? { ...b, projectId: pid } : b));
    try { await setBoardProject(board.id, pid); void refresh(); } catch (e: any) { setBoard(b => (b ? { ...b, projectId: was } : b)); toast(e?.message || 'Could not set the project.', 'error'); } };
  const onDelete = async () => { if (!board) return;
    const ok = await askConfirm({ title: `Delete “${board.name}”?`, body: ['The board and its layout are removed. Your results and uploads stay in Assets.'], confirm: 'Delete board', danger: true }); if (!ok) return;
    try { await deleteBoard(board.id); const bs = await refresh(); const next = bs[0]?.id; setBoard(null);
      if (next) go(next, true); else { const nb = await createBoard(); await refresh(); go(nb.id, true); } toast('Board deleted'); } catch (e: any) { toast(e?.message || 'Could not delete the board.', 'error'); } };

  /* your agent made, renamed or switched boards (canvas_create_board / canvas_switch_board): follow it live */
  const onBoardsChanged = useCallback(() => { void refresh().catch(() => undefined); }, [refresh]);
  const onAgentOpen = useCallback((id: string, name: string, by: string) => { void refresh().catch(() => undefined); go(id); toast(`${by} opened “${name}”`); }, [refresh]); // eslint-disable-line react-hooks/exhaustive-deps
  /* release 2: a proposal made from the board (a Group's Run the flow) opens the dock; Change the budget on a proposal opens the dialog */
  const budgetRef = useRef(onBudget); budgetRef.current = onBudget;
  useEffect(() => { const dock = () => { setAgentOpen(true); writeAgentOpen(true); }; const ask = () => void budgetRef.current();
    addEventListener(OPEN_DOCK_EVT, dock); addEventListener(BUDGET_ASK_EVT, ask);
    return () => { removeEventListener(OPEN_DOCK_EVT, dock); removeEventListener(BUDGET_ASK_EVT, ask); }; }, []);
  const current = boards?.find(b => b.id === board?.id) ?? (board ? { ...board } : null);
  const rootStyle = { top, bottom, '--cv-agent-w': agentOpen ? `var(--cv-dock,${DOCK_W}px)` : '0px', '--cv-drawer-w': drawer ? '344px' : '0px', '--cv-panel-w': panelOn && !drawer ? (engine === 'rf' ? 'var(--cv-insp-w)' : 'var(--cv-dock,380px)') : '0px' } as CSSProperties;
  return <div className={`cv-root${agentOpen ? ' cv-agent-open' : ''}`} style={rootStyle} data-testid="canvas-page">
    {err ? <div className="cv-msg"><p>{err}</p><button type="button" className="cv-empty-btn" onClick={() => navigate(`/canvas${search}`, { replace: true })}>Try again</button></div>
      : board && current ? <>
        {engine === 'rf' ? <Suspense fallback={<div className="cv-msg"><Skeleton variant="tiles" count={3} /></div>}><RfBoard key={board.id} onBoard={setBoardApi} board={board} onSaveState={setSave} onSaved={onSaved} drawerOpen={drawer} setDrawerOpen={setDrawer} onProject={onProject} /></Suspense>
          : <Board key={board.id} onBoard={setBoardApi} board={board} onSaveState={setSave} onSaved={onSaved} drawerOpen={drawer} setDrawerOpen={setDrawer} onProject={onProject} />}
        <div className="cv-topl">
          {!agentOpen && <button type="button" className={`cv-agent-btn${agentBusy ? ' busy' : ''}`} aria-pressed={false} aria-label="Show the AI panel" data-testid="cv-agent-toggle" onClick={toggleAgent}><SparkleIcon size={16} /><span>AI</span>{agentBusy && <i className="cv-agent-dot" aria-hidden />}</button>}
          <BoardSwitcher boards={boards ?? []} current={current} save={save} onPick={id => id !== board.id && go(id)} onNew={onNew} onRename={onRename} onDelete={onDelete} onBudget={onBudget} /><SpendChip boardId={board.id} onBudget={onBudget} /><FollowToggle busy={agentBusy} />
          <button type="button" className={`cv-assets-btn${drawer ? ' on' : ''}`} aria-pressed={drawer} aria-label="Assets" data-testid="cv-assets" onClick={toggleDrawer}><PanelIcon size={16} /><span>Assets</span></button>
        </div>
        <div className="cv-agent-slot" data-slot="agent-panel" data-testid="cv-agent-slot" aria-hidden={!agentOpen}>
          <AgentPanel key={board.id} boardId={board.id} ask={ask} open={agentOpen} onClose={toggleAgent} onBusy={setAgentBusy} onBoards={onBoardsChanged} onOpenBoard={onAgentOpen} />
        </div>
        {boardApi && <BoardProvider value={boardApi}><CardPanel hidden={drawer} onOpen={setPanelOn} variant={engine === 'rf' ? 'inspector' : undefined} /></BoardProvider>}
      </> : <div className="cv-msg"><Skeleton variant="tiles" count={3} /></div>}
  </div>;
}
