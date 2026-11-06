/**
 * The canvas AI dock (left edge, 380 px, open by default; mounted in CanvasPage's .cv-agent-slot). One conversation with the agent:
 *  - an empty board starts with a prompt box and starters (Short film from idea, Make a 30s film, Product ad, Make a clip longer, One picture three takes, Explore an idea);
 *  - the agent's plan shows as a checklist, and every tool call it makes shows as a media card (AgentMediaCard: live thumbnail,
 *    progress, model, price or Free, Keep / Re-roll / Open in tool) while the board on the right builds;
 *  - each paid step is a proposal card with its quote, total and Go / Cancel. Go is the only thing that starts a run: the server sends
 *    the page a run_proposal op and agentBridge submits through agentApi.submit. Nothing in this file ever spends on its own.
 *
 * Who answers: an MCP client (Claude Code, Claude Desktop…) when one is connected to this board (the prompt lands in canvas_inbox);
 * otherwise the built-in demo agent (server/src/canvasDemo.ts), which plays a scripted plan through the same ops and proposals.
 */
import { useDraftField } from '../shared/batch1';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useValue, type BoardApi } from './boardApi';
import { useCanvasBoard } from './agentApi';
import { useCatalog, catalogNow } from './catalog';
import { pickFromSelection, livePickChoices, pickOffscreen } from './pickAsk';
import { priceChangedText } from './priceLock';
import { startAgentBridge, nameOf as cardNameOf, type FeedEntry, type Proposal, type PickAsk } from './agentBridge';
import { handAtom, handOf, fx, setAgentName, reducedMotion } from './agentHand';
import { flowById, flowInfo } from '../shared/genFlows';
import { LOCAL_FREE } from '../../../server/src/shared/modelIds';
import { repricePairs, hiddenByReprice, repriceRows, isPriceStop } from './proposalMerge';
import { usdPrice, fmtUsd } from '../shared/billing';
import { FlowIcon } from './GenCardShape';
import type { GenMedium } from '../shared/genFlows';
import { STARTERS, mergeFeed, mergeProposals, planOf, confirmOf, focusAdded, focusCards, setFollow, agentStarterPrompt, dockRoute, dockState, dockStatusLine, dockPill, workingLine, messageStatus, messageStatusText, listenCommand, LISTEN_PHRASE, type StarterId, type MsgStatus } from './agentDockModel';
import { AgentMediaCard } from './AgentMediaCard';
import { useCopied, Copied, useToast } from '../shared/Toast';
import { GenPrice } from '../shared/GenPrice';
import { tip } from '../shared/Tooltip';
import { SparkleIcon, CloseIcon, TrashIcon, DirectorIcon, ProductIcon, ExtendIcon, ExploreIcon, VideoIcon, ApiPlugIcon, MaterialIcon } from '../ui/Icons';
import { PaperclipIcon, CopyIcon, PlusIcon, ArrowIcon, RetryIcon, CoinIcon, ChevronLeftIcon, CheckIcon, StopIcon, SendIcon, NoteIcon, GroupIcon } from './icons';
import { useProfile, nameOf, UserAvatar } from '../shared/profile';
import { SAMPLE_SITE, AGENT_NOTE } from '../shared/sampleSite';
import { SampleSiteNote } from '../shared/SampleMode';
import { uploadMedia } from '../shared/batch1';
import { IMAGE_ACCEPT } from '../../../server/src/shared/mediaAccept';
import { planDockPictures, pictureName, MAX_DOCK_PICTURES, type DockPicture } from '../../../server/src/shared/canvasPictures';
import { createAuxNode } from './auxShapes';
import { NODE_DEFS } from './nodeTypes';
import { freeSpot } from './placement';
import { mediaPoster } from './fileDrop';
import './agentPanel.css';

const AGENT_FRESH_MS = 90_000; /* the server's window: an agent that stopped waiting or polling for 90 s isn't listening any more */
const time = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const STARTER_ICON: Record<StarterId, (p: { size?: number }) => JSX.Element> = { short: SparkleIcon, film: DirectorIcon, product: ProductIcon, animate: ExtendIcon, takes: VideoIcon, material: MaterialIcon, free: ExploreIcon };
const CHIPS_SHOWN = 3;
type Demo = { running: boolean; runId: string | null; title: string | null };

/** Board.tsx puts the board in agentApi's context; the dock lives outside it, so wait for a live one (after a board switch the
 *  context can still hold the previous board for a moment: a disposed board never counts). */
function useBoardReady(): BoardApi | null {
  const live = () => { const e = useCanvasBoard(); return e && !e.disposed ? e : null; };
  const [board, setBoard] = useState<BoardApi | null>(live);
  useEffect(() => {
    if (board && !board.disposed) { const t = window.setInterval(() => { if (board.disposed) setBoard(live()); }, 500); return () => window.clearInterval(t); }
    const t = window.setInterval(() => { const e = live(); if (e) { setBoard(e); window.clearInterval(t); } }, 120);
    return () => window.clearInterval(t);
  }, [board]);
  return board && !board.disposed ? board : null;
}

function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, flash] = useCopied(); const toast = useToast(); const tipText = label || 'Copy';
  return <button type="button" className="ap-copy" disabled={!text} aria-label={tipText} {...tip(tipText)}
    onClick={async () => { if (!text) return; try { await navigator.clipboard.writeText(text); flash(); } catch { toast('Could not copy. Select the text instead.', 'warn'); } }}>
    {copied ? <Copied text="Copied" /> : <><CopyIcon size={13} />{label ? <span>{label}</span> : null}</>}
  </button>;
}

/** "Connect your own AI": the MCP address and the Claude Code / Claude Desktop snippets, as a sheet over the dock. */
function ConnectSheet({ config, mcpUrl, onClose, boardId, boardName }: { config: any; mcpUrl: string; onClose: () => void; boardId: string; boardName?: string | null }) {
  const prompt = agentStarterPrompt(boardId, boardName);
  const claudeCode = mcpUrl ? `claude mcp add --transport http imagination ${mcpUrl}` : '';
  const desktop = mcpUrl ? JSON.stringify({ mcpServers: { imagination: { url: mcpUrl } } }, null, 2) : '';
  const channel = config?.mcp?.channel as { add: string; start: string } | undefined;
  return <div className="ap-sheet" role="dialog" aria-label="Connect your own AI" data-testid="agent-bring">
    <div className="ap-sheet-h"><b>Connect your own AI</b><button type="button" className="ap-icon" aria-label="Close" onClick={onClose} data-testid="agent-bring-close"><CloseIcon size={15} /></button></div>
    <div className="ap-scroll">
      <p className="ap-sheet-p">Your own Claude (or any MCP client) becomes the brain of this dock: what you type here goes to it, and it builds on the board with the same tools. It still asks before anything runs.</p>
      <ol className="ap-steps"><li>Add the MCP address to your AI (below).</li><li>Paste the starter prompt into a chat. It starts listening to this board.</li><li>Type here. Your AI plans, builds drafts and quotes; you press Go.</li></ol>
      <section className="ap-card"><div className="ap-card-h"><span className="ap-kicker">Starter prompt</span><CopyButton text={prompt} /></div>
        <pre className="ap-code ap-prompt" data-testid="agent-starter-prompt">{prompt}</pre></section>
      <section className="ap-card"><div className="ap-card-h"><span className="ap-kicker">MCP address</span><CopyButton text={mcpUrl} /></div>
        <code className="ap-url" data-testid="agent-mcp-url">{mcpUrl || (config ? 'The server did not report an MCP address. Reload the page.' : 'Reading the address…')}</code></section>
      <section className="ap-card"><div className="ap-card-h"><span className="ap-kicker">Claude Code</span><CopyButton text={claudeCode} /></div>
        <pre className="ap-code" data-testid="agent-claude-code">{claudeCode || '…'}</pre></section>
      <section className="ap-card"><div className="ap-card-h"><span className="ap-kicker">Claude Desktop</span><CopyButton text={desktop} /></div>
        <pre className="ap-code ap-json" data-testid="agent-claude-desktop">{desktop || '…'}</pre></section>
      <section className="ap-card" data-testid="agent-live-push"><div className="ap-card-h"><span className="ap-kicker">Claude Code · live push (optional)</span></div>
        <p className="ap-sheet-p">Skip “{LISTEN_PHRASE}”: your messages wake Claude Code on their own. It uses Claude Code’s channels preview, so it runs the MCP server on this computer (built once with <code>npm run mcp:build</code>) instead of the address above.</p>
        <div className="ap-card-h"><span className="ap-kicker">1 · Add it once</span><CopyButton text={channel?.add ?? ''} /></div>
        <pre className="ap-code" data-testid="agent-channel-add">{channel?.add || '…'}</pre>
        <p className="ap-foot">Added the address above already? Run <code>claude mcp remove imagination</code> first: this takes its place.</p>
        <div className="ap-card-h"><span className="ap-kicker">2 · Start Claude Code with</span><CopyButton text={channel?.start ?? ''} /></div>
        <pre className="ap-code" data-testid="agent-channel-start">{channel?.start || '…'}</pre>
        <p className="ap-foot">Claude Code asks once to confirm the preview. Without the flag it still works the usual way.</p></section>
      <p className="ap-foot">Your AI can add and change cards. Canvas proposals wait for your Go; direct MCP runs follow your configured permissions.</p>
    </div>
  </div>;
}

const eventIcon = (e: FeedEntry) => {
  if (e.type === 'decision') return e.decision === 'cancel' ? <CloseIcon size={13} /> : <CheckIcon size={13} />;
  if (/^Added a note/.test(e.text)) return <NoteIcon size={13} />;
  if (/^(Made a frame|Put )/.test(e.text)) return <GroupIcon size={13} />;
  if (/^Added/.test(e.text)) return <PlusIcon size={13} />;
  if (/^Connected/.test(e.text)) return <ArrowIcon size={13} />;
  if (/^Removed/.test(e.text)) return <TrashIcon size={13} />;
  if (/^Proposed/.test(e.text)) return <CoinIcon size={13} />;
  if (/^(Started|Could not)/.test(e.text)) return <RetryIcon size={13} />;
  return <SparkleIcon size={13} />;
};

/** Your side of the chat: your picture and display name (shared profile, updates live). */
function MeLabel() { const prof = useProfile(); const n = nameOf(prof); return <span className="ap-me" data-testid="agent-msg-me" title={n}><UserAvatar profile={prof} size={16} /><span>{n}</span></span>; }

/** A new agent message types itself out (a few words at a time, quick); old ones, your own and reduced motion show at once. */
function TypedText({ text, live }: { text: string; live: boolean }) {
  const [n, setN] = useState(() => (live && !reducedMotion() ? 0 : text.length));
  useEffect(() => {
    if (n >= text.length) return;
    const t = window.setTimeout(() => setN((x) => { const next = text.indexOf(' ', x + 3); return next < 0 ? text.length : next + 1; }), document.visibilityState === 'hidden' ? 0 : 22);
    return () => window.clearTimeout(t);
  }, [n, text]);
  return <>{text.slice(0, n)}{n < text.length && <span className="ap-caret" aria-hidden />}</>;
}
function Message({ e, who, live = false, status = null, onFocus }: { e: FeedEntry; who: string; live?: boolean; /** your message: waiting / sent / read (2026-10-28) */ status?: MsgStatus; onFocus?: (id: string) => void }) {
  const agent = e.from === 'agent'; const pics: DockPicture[] = !agent && Array.isArray(e.meta?.pictures) ? e.meta.pictures : [];
  return <div className={`ap-msg ${agent ? 'agent' : 'user'}${e.meta?.error ? ' err' : ''}${live ? ' fresh' : ''}`} data-testid="agent-message">
    <div className="ap-msg-h">{agent ? <span className="ap-who"><i className="ap-who-mark"><SparkleIcon size={11} /></i>{who}</span> : <MeLabel />}<time>{time(e.at)}</time></div>
    {pics.length > 0 && <div className="ap-msg-pics" data-testid="agent-msg-pictures">{pics.map((p, i) => <button key={p.card_id} type="button" className="ap-msg-pic" onClick={() => onFocus?.(p.card_id)} aria-label={`Show ${p.name} on the board`} {...tip(`image ${i + 1}: ${p.name}`)}>
      <img src={p.url} alt="" draggable={false} /></button>)}</div>}
    {(agent || e.text) && <p aria-label={agent && live ? e.text : undefined}>{agent ? <TypedText text={e.text} live={live} /> : e.text}</p>}
    {status && <small className={`ap-read ${status}`} data-testid="agent-msg-status" data-state={status} aria-live="polite">{status === 'read' ? <CheckIcon size={11} /> : <i aria-hidden />}{messageStatusText(status, who)}</small>}
  </div>;
}

/** Connected but not listening (2026-10-28): the one thing to type in Claude Code, with a copy button. The MCP prompt names the board, so
 *  Claude needs no guessing; the plain phrase works too (the server instructions teach it). */
function ListenHint({ boardId, name, onSetup }: { boardId: string; name: string; onSetup: () => void }) {
  const cmd = listenCommand(boardId);
  return <div className="ap-listen" data-testid="agent-listen-hint">
    <p><b>{name} isn't reading this board yet.</b> Type this in {name}:</p>
    <div className="ap-listen-row"><code className="ap-listen-cmd" data-testid="agent-listen-command" title={cmd}>{cmd}</code><CopyButton text={cmd} /></div>
    <small>Or just say “{LISTEN_PHRASE}”. <button type="button" className="ap-link" onClick={onSetup} data-testid="agent-listen-setup">Skip this step every time</button></small>
  </div>;
}

/** "Claude asks ↗": while a pick waits and none of its cards is on screen, a calm chip on the board's edge. Nothing moves until you click
 *  it; then the board glides to the cards. */
function PickEdgeChip({ board, ids, who }: { board: BoardApi; ids: string[]; who: string }) {
  const off = useValue('pick offscreen', () => { const bs = ids.map((id) => board.boundsOf(id as any)).filter(Boolean) as any[]; return pickOffscreen(bs, board.viewportBounds()); }, [board, ids.join(',')]);
  const box = useValue('pick board box', () => { board.camera(); const r = board.container().getBoundingClientRect(); return { left: r.left + r.width / 2, top: r.top + 72 }; }, [board]); /* under the board's top bar */
  if (!off) return null;
  const go = () => { const bs = ids.map((id) => board.boundsOf(id as any)).filter(Boolean) as any[]; if (!bs.length) return;
    const x = Math.min(...bs.map((b) => b.minX)), y = Math.min(...bs.map((b) => b.minY)); board.fitBounds({ x, y, w: Math.max(...bs.map((b) => b.maxX)) - x, h: Math.max(...bs.map((b) => b.maxY)) - y }, { duration: 420, zoom: Math.max(0.5, board.zoom()) }); };
  return createPortal(<button type="button" className="ap-pick-edge" style={{ left: box.left, top: box.top }} onClick={go} data-testid="pick-edge-chip">{who} asks you to pick<span aria-hidden> ↗</span></button>, document.body);
}

/** "Pick the one you like": the cards as small thumbnails with a Pick button each; clicking a card on the board does the same. */
function PickCard({ e, pick, board, onPick, onFocus, onGlow }: { e: FeedEntry; pick: PickAsk | null; board: BoardApi | null; onPick: (cardId: string) => void; onFocus: (id: string) => void; onGlow: (id: string) => void }) {
  const ids: string[] = e.meta?.pick?.cardIds ?? []; const live = !!pick && pick.id === e.meta?.pick?.id; const waiting = live && pick!.status === 'waiting'; const chosen = live ? pick!.chosen : null;
  const cards = useValue('pick cards', () => ids.map((id) => { const s = board?.getNode(id as any); const p: any = s?.props; const t = p?.takes?.[p?.take ?? 0];
    return { id, here: !!s, name: (board && cardNameOf(board, id as any)) || String(p?.prompt ?? 'Card').slice(0, 40), poster: t?.poster || (t?.kind === 'image' ? t.url : '') || '' }; }), [board, ids.join(',')]);
  return <section className={`ap-pick${waiting ? ' waiting' : ''}`} data-testid="agent-pick" data-state={waiting ? 'waiting' : chosen ? 'picked' : 'closed'}>
    <div className="ap-pick-h"><span className="ap-kicker">{waiting ? 'Your pick' : chosen ? 'You picked' : 'Pick one'}</span>{waiting && <small>Click one here or on the board</small>}</div>
    <div className="ap-pick-row" role="list">{cards.map((c) => <button key={c.id} type="button" role="listitem" className={`ap-pick-it${chosen === c.id ? ' on' : ''}${chosen && chosen !== c.id ? ' off' : ''}`} data-testid="agent-pick-item"
      disabled={!c.here || (!waiting && !chosen)} aria-pressed={chosen === c.id} onClick={() => (waiting ? onPick(c.id) : onFocus(c.id))} onMouseEnter={() => waiting && onGlow(c.id)} /* a look only: hovering never selects, picks or moves the board */
      aria-label={waiting ? `Pick ${c.name}` : c.name}>
      <span className="ap-pick-img">{c.poster ? <img src={c.poster} alt="" draggable={false} /> : <SparkleIcon size={16} />}{chosen === c.id && <i className="ap-pick-ok"><CheckIcon size={11} /></i>}</span>
      <b>{c.name}</b></button>)}</div>
  </section>;
}

function PlanCard({ title, steps, done, finished, live }: { title: string; steps: string[]; done: number; finished: boolean; live: boolean }) {
  return <section className="ap-plan" data-testid="agent-plan" aria-label={`Plan: ${title}`}>
    <div className="ap-plan-h"><span className="ap-kicker">Plan</span><b>{title}</b><small>{Math.min(done, steps.length)}/{steps.length}</small></div>
    <ol>{steps.map((s, i) => { const st = i < done || finished ? 'done' : i === done && live ? 'now' : 'todo';
      return <li key={i} className={st} data-state={st}><i aria-hidden>{st === 'done' ? <CheckIcon size={11} /> : i + 1}</i><span>{s}</span></li>; })}</ol>
  </section>;
}

/** The short film's step tracker: "1 Beats · 2 Cast · 3 Key frames · 4 Film", pinned at the top of the dock while the agent works. */
function StepTracker({ steps, done, finished, live }: { steps: string[]; done: number; finished: boolean; live: boolean }) {
  return <nav className="ap-track" aria-label="Steps" data-testid="agent-tracker">{steps.map((s, i) => { const st = i < done || finished ? 'done' : i === done && live ? 'now' : 'todo';
    return <span key={s} className={st} data-state={st} aria-current={st === 'now' ? 'step' : undefined}><i aria-hidden>{st === 'done' ? <CheckIcon size={10} /> : i + 1}</i>{s}</span>; })}</nav>;
}
/** "Looks good": the agent waits for your OK (or your edit, typed below). */
function ConfirmCard({ label, onOk, busy }: { label: string; onOk: () => void; busy: boolean }) {
  return <div className="ap-confirm" data-testid="agent-confirm"><button type="button" className="ap-go" data-testid="agent-looks-good" disabled={busy} onClick={onOk}><CheckIcon size={13} />{label}</button><small>Or type what to change.</small></div>;
}

function EventRow({ e, onFocus }: { e: FeedEntry; onFocus: (id?: string | null) => void }) {
  const clickable = !!e.cardId;
  return <button type="button" className={`ap-event${clickable ? ' link' : ''}${e.type === 'decision' ? ' decision' : ''}`} disabled={!clickable}
    onClick={() => onFocus(e.cardId)} aria-label={clickable ? `${e.text}. Show it on the board.` : e.text} data-testid={e.type === 'decision' ? 'agent-decision' : 'agent-activity'}>
    <span className="ap-ev-ic">{eventIcon(e)}</span><p>{e.text}</p><time>{time(e.at)}</time>
  </button>;
}

function ProposalCard({ p, busy, onDecide, onFocus, hideNote }: { p: Proposal; busy?: 'go' | 'cancel'; onDecide: (d: 'go' | 'cancel') => void; onFocus: (ids: string[]) => void; /** a price stop's ask-again: its card already said why */ hideNote?: boolean }) {
  const pending = p.status === 'pending';
  /* rows that can't run here are skipped, not a blocker: Go starts the rest (server: proposal.runCardIds). Older proposals without it: every problem-free row. */
  const runIds = new Set(p.runCardIds ?? p.items.filter((i) => !i.problem).map((i) => i.cardId)); const nRun = runIds.size; const nSkip = p.items.length - nRun;
  const disabled = p.overBudget || !!p.reason || nRun === 0;
  const runItems = p.items.filter((i) => runIds.has(i.cardId)); const nRuns = runItems.reduce((a, i) => a + (Number(i.quote?.runs) > 1 ? Number(i.quote.runs) : 1), 0); /* a Material Swap card runs once per swatch */ const allDemo = runItems.length > 0 && runItems.every((i) => i.quote?.demo === true);
  const budget = p.budget;
  /* a price stop is calm (amber), said once: the rows say what moved, a fresh proposal below asks again */
  const priceStop = p.items.some((i) => i.priceChanged) && !p.items.some((i) => !i.priceChanged && (p.failedIds ?? []).includes(i.cardId));
  return <article className={`ap-prop ${p.status}`} data-testid="agent-proposal" data-status={p.status}>
    <div className="ap-prop-h"><span className="ap-kicker">{pending ? 'Needs your OK' : p.status === 'running' ? 'Starting' : p.status === 'approved' ? 'Approved' : p.status === 'cancelled' ? 'Cancelled' : p.status === 'drafts' ? 'Drafts · nothing to run yet' : priceStop ? 'Price changed · asked again' : 'Could not start'}</span>
      <button type="button" className="ap-prop-n" onClick={() => onFocus(p.cardIds)} {...tip('Show these cards on the board')}>{nRuns} run{nRuns === 1 ? '' : 's'}{nSkip ? ` · ${nSkip} skipped` : ''}</button></div>
    {p.note && !hideNote && <p className="ap-prop-note">{p.note}</p>}
    <ul className="ap-items">{p.items.map((it, i) => {
      const q = it.quote; const free = q?.localRun === true || q?.cost?.billedTo === 'local'; const demo = q?.demo === true;
      const skip = !runIds.has(it.cardId); const moved = it.priceChanged;
      return <li key={it.cardId} className={skip ? 'has-problem' : moved ? 'price-changed' : ''} data-testid="agent-proposal-item" data-skipped={skip ? '1' : undefined} data-price-changed={moved ? '1' : undefined}>
        <span className="ap-item-n">{i + 1}</span>
        <div className="ap-item-t"><b>{it.title}</b><small>{(() => { const f = flowById(it.workflow); return f ? flowInfo(f, catalogNow()).name : 'Card'; })() /* a workflow card's own name (Material Swap), not its id */}{it.model ? ` · ${it.model}` : ''}{Number(it.quote?.runs) > 1 ? ` · ${it.quote.runs} swatches` : ''}</small>{skip && <small className="ap-item-why" title={it.problem ?? undefined}>{it.problem ?? "Can't run here"}</small>}
          {moved && <small className="ap-item-moved" data-testid="agent-proposal-price-changed">{priceChangedText(moved.reason, moved.wasUsd, moved.nowUsd)} · asked again below</small>}</div>
        <span className="ap-item-p">{skip ? <em className="ap-item-skip">Skipped</em> : q ? <GenPrice q={q} credits={it.credits} demo={demo} free={free} compact /> : <em>—</em>}</span>
      </li>;
    })}</ul>
    <div className="ap-total"><span>Total</span><b data-testid="agent-proposal-total">{nRun === 0 ? '—' : totalWords(runItems, p.totalUsd)}</b></div>
    {budget?.remainingUsd != null && <div className="ap-budget"><span>Agent budget left</span><b>{fmtUsd(budget.remainingUsd)} of {fmtUsd(budget.budgetUsd ?? 0)}</b></div>}
    {p.boardBudget && <div className="ap-budget" data-testid="agent-proposal-board-budget"><span>Board budget left</span><b>{fmtUsd(p.boardBudget.leftUsd)} of {fmtUsd(p.boardBudget.usd)}</b></div>}
    {p.reason && <p className={`ap-warn${p.overBudget ? ' over' : ''}`} data-testid="agent-proposal-reason">{p.reason}</p>}
    {!p.reason && nSkip > 0 && pending && <p className="ap-skipnote" data-testid="agent-proposal-skipped">{nSkip === 1 ? '1 card can’t run here, so Go skips it.' : `${nSkip} cards can’t run here, so Go skips them.`} Nothing is charged for {nSkip === 1 ? 'it' : 'them'}.</p>}
    {p.error && <p className={`ap-warn${priceStop ? '' : ' over'}`} data-testid={priceStop ? 'agent-proposal-price-stop' : undefined}>{p.error}</p>}
    {pending && <div className="ap-prop-actions">
      <button type="button" className="ap-go" data-testid="agent-go" disabled={disabled || !!busy} onClick={() => onDecide('go')}>{busy === 'go' ? 'Starting…' : `Go${allDemo || p.totalUsd <= 0 ? '' : ` · ${fmtUsd(p.totalUsd)}`}`}</button>
      <button type="button" className="ap-cancel" data-testid="agent-cancel" disabled={!!busy} onClick={() => onDecide('cancel')}>{busy === 'cancel' ? 'Cancelling…' : 'Cancel'}</button>
    </div>}
    {p.status === 'running' && <p className="ap-prop-state">Starting the runs…</p>}
    {p.status === 'approved' && <p className="ap-prop-state ok">Approved · {p.jobIds.length} run{p.jobIds.length === 1 ? '' : 's'} started</p>}
    {p.status === 'cancelled' && <p className="ap-prop-state">Cancelled. Nothing ran.</p>}
    {p.status === 'drafts' && <p className="ap-prop-state" data-testid="agent-proposal-drafts">These stay on the board as drafts. Nothing ran.</p>}
    {p.status === 'failed' && (priceStop ? <p className="ap-prop-state">Nothing ran · price changed</p> : <p className="ap-prop-state bad">Nothing ran. {p.error}</p>)}
  </article>;
}

/** The proposal total in the same tokens as every Generate button (GenPrice / billing.priceToken): Sample, Free · this computer, ≈ $0.42. */
export function totalWords(items: { quote: any }[], totalUsd: number): string {
  if (items.length && items.every((i) => i.quote?.demo === true)) return 'Sample';
  if (totalUsd > 0) return usdPrice(totalUsd, { approx: items.some((i) => isEstimate(i.quote)) });
  return items.length && items.every((i) => i.quote?.localRun === true || i.quote?.cost?.billedTo === 'local') ? LOCAL_FREE : 'Free';
}
/** ≈ only on a price that is an estimate (the quote says so, or says nothing): the same rule as GenPrice's token (billing.costToken). */
const isEstimate = (q: any) => !(q?.cost && typeof q.cost === 'object' && q.cost.estimated === false);
/** A price stop's dollars: the app's format (billing.fmtUsd), but always 3 decimals under 10 cents, so an old and a new price side by side
 *  read at the same precision ($0.030 → $0.039, never $0.03 → $0.039). */
const usd3 = (n: number) => (n > 0 && n < 0.1 ? `$${n.toFixed(3)}` : fmtUsd(n));
const rowUsd = (usd: number | null, q: any, approx: boolean) => (q?.demo === true ? 'Sample' : q?.localRun === true || q?.cost?.billedTo === 'local' ? LOCAL_FREE : usd == null ? '—' : `${approx && isEstimate(q) ? '≈ ' : ''}${usd3(usd)}`);
/** Old price small and struck (no ≈: it is only the reference), the new one under it; just the new one when they read the same. */
function PriceMove({ was, now, testId }: { was: string | null; now: string; testId?: string }) {
  return <span className="ap-move">{was && <s data-testid={testId ? `${testId}-was` : undefined}>{was}</s>}<b data-testid={testId}>{now}</b></span>;
}

/** A price stop (owner-approved design, 2026-11-06): the approval Go stopped and its ask-again are ONE card that changes in place.
 *  "New price · Nothing ran", each moved row old → new, the total old → new, Cancel / Run for $x, and one quiet history line under it.
 *  Cancel turns it into a quiet line; Run turns it into the normal running card. Rows that did start at Go say Started. */
function RepriceCard({ origin, child, board, busy, onDecide, onFocus }: { origin: Proposal; child: Proposal | null; board: BoardApi | null; busy?: 'go' | 'cancel'; onDecide: (p: Proposal, d: 'go' | 'cancel') => void; onFocus: (ids: string[]) => void }) {
  const history = <p className="ap-history" data-testid="agent-proposal-history">You approved at {usd3(origin.totalUsd)} · {time(origin.decidedAt ?? origin.createdAt)}</p>;
  if (child?.status === 'cancelled') return <EventRow e={{ seq: 0, id: child.id, at: child.decidedAt ?? Date.now(), type: 'decision', decision: 'cancel', text: 'Cancelled. Nothing ran.' }} onFocus={() => undefined} />;
  if (child && child.status !== 'pending') return <div className="ap-reprice-done"><ProposalCard p={child} hideNote onDecide={(d) => onDecide(child, d)} onFocus={onFocus} />{history}</div>;
  const rows = repriceRows(origin, child); const moved = rows.filter((r) => r.state === 'moved'); const started = rows.filter((r) => r.state === 'started').length;
  const was = moved.reduce((a, r) => a + (r.wasUsd ?? 0), 0); const now = child ? child.totalUsd : moved.reduce((a, r) => a + (r.nowUsd ?? 0), 0);
  const est = moved.some((r) => isEstimate(r.quote));
  const sample = !!child && child.items.length > 0 && child.items.every((i) => i.quote?.demo === true);
  const totalNow = sample ? 'Sample' : `${est ? '≈ ' : ''}${usd3(now)}`; const totalWas = !sample && usd3(was) !== usd3(now) ? usd3(was) : null;
  const checking = !child && Date.now() - (origin.decidedAt ?? origin.createdAt) < 20_000;
  return <div className="ap-reprice-wrap">
    <article className="ap-prop pending ap-reprice" data-testid="agent-proposal" data-status="repriced">
      <div className="ap-prop-h"><span className="ap-kicker ap-kicker-warn">New price</span>
        <button type="button" className="ap-prop-n" onClick={() => onFocus(origin.cardIds)} {...tip('Show these cards on the board')} data-testid="agent-proposal-ran">{started ? `${started} started` : 'Nothing ran'}</button></div>
      <ul className="ap-items">{rows.map((r) => <RepriceItem key={r.cardId} r={r} board={board} />)}</ul>
      {moved.length > 0 && <div className="ap-total"><span>Total</span><PriceMove was={totalWas} now={totalNow} testId="agent-proposal-total" /></div>}
      {child?.reason && <p className={`ap-warn${child.overBudget ? ' over' : ''}`} data-testid="agent-proposal-reason">{child.reason}</p>}
      {child ? <div className="ap-prop-actions">
        <button type="button" className="ap-go" data-testid="agent-go" disabled={!!busy || !!child.reason || child.overBudget || !(child.runCardIds ?? []).length} onClick={() => onDecide(child, 'go')}>{busy === 'go' ? 'Starting…' : child.totalUsd > 0 && !sample ? `Run for ${usd3(child.totalUsd)}` : 'Run'}</button>
        <button type="button" className="ap-cancel" data-testid="agent-cancel" disabled={!!busy} onClick={() => onDecide(child, 'cancel')}>{busy === 'cancel' ? 'Cancelling…' : 'Cancel'}</button>
      </div> : checking ? <p className="ap-prop-state">Checking the new price…</p> : null}
    </article>
    {history}
  </div>;
}
function RepriceItem({ r, board }: { r: ReturnType<typeof repriceRows>[number]; board: BoardApi | null }) {
  const look = useValue('reprice row', () => { const p: any = board?.getNode(r.cardId as any)?.props; const t = p?.takes?.[p?.take ?? 0];
    return { poster: t?.poster || (t?.kind === 'image' ? t.url : '') || '', medium: (p?.medium ?? 'image') as GenMedium }; }, [board, r.cardId]);
  const f = flowById(r.workflow); const name = f ? flowInfo(f, catalogNow()).name : 'Card';
  return <li className={r.state === 'moved' ? 'price-moved' : r.state === 'skipped' ? 'has-problem' : 'is-done'} data-testid="agent-proposal-item" data-state={r.state} data-price-changed={r.state === 'moved' ? '1' : undefined}>
    <span className="ap-tc-thumb ap-item-thumb" aria-hidden>{look.poster ? <img src={look.poster} alt="" draggable={false} /> : <span className="ap-tc-ic"><FlowIcon flow={r.workflow} medium={look.medium} size={14} /></span>}</span>
    <div className="ap-item-t"><b title={r.title}>{r.title}</b><small>{name}{r.model ? ` · ${r.model}` : ''}</small></div>
    <span className="ap-item-p">{r.state === 'moved' ? <PriceMove was={r.wasUsd != null && r.nowUsd != null && usd3(r.wasUsd) !== usd3(r.nowUsd) ? rowUsd(r.wasUsd, r.quote, false) : null} now={rowUsd(r.nowUsd, r.quote, true)} testId="agent-proposal-row-price" />
      : <em className={r.state === 'skipped' ? 'ap-item-skip' : undefined}>{r.state === 'started' ? 'Started' : r.state === 'skipped' ? 'Skipped' : 'Didn’t start'}</em>}</span>
  </li>;
}

function Starters({ onPick, disabled }: { onPick: (id: StarterId) => void; disabled: boolean }) {
  return <div className="ap-starters" role="list" aria-label="Starters">
    {STARTERS.map((s) => { const Ic = STARTER_ICON[s.id];
      return <button key={s.id} type="button" role="listitem" className="ap-starter" data-testid={`agent-starter-${s.id}`} disabled={disabled} onClick={() => onPick(s.id)}>
        <i aria-hidden><Ic size={16} /></i><span><b>{s.label}</b><small>{s.hint}</small></span></button>; })}
  </div>;
}

/** asks already sent this visit (a remount for the same board never sends twice) */
const askedOnce = new Set<string>();
/** What the server says about your agent (canvasAgent.ts Presence): connected as soon as an MCP client connects; listening once it works on this board. */
type AgentPresence = { connected: boolean; listening?: boolean; /** a canvas_* call on this board lately (2026-10-28) */ working?: boolean; listenVia?: 'wait' | 'channel' | null; channel?: boolean; lastAgentAt: number | null; agentName: string | null; sessions?: { id: string; name: string }[] };
export function AgentPanel({ boardId, open, onClose, onBusy, onBoards, onOpenBoard, ask = '' }: { /** words to send once (Explore's Ask an agent, /canvas?ask=) */ ask?: string; boardId: string; open: boolean; onClose: () => void; onBusy?: (busy: boolean) => void;
  /** the board list changed (made, renamed, deleted) */ onBoards?: () => void; /** your agent wants this board shown */ onOpenBoard?: (boardId: string, name: string, by: string) => void }) {
  const board = useBoardReady(); useCatalog(); const toast = useToast();
  const [config, setConfig] = useState<any>(null);
  const [agent, setAgent] = useState<AgentPresence>({ connected: false, listening: false, lastAgentAt: null, agentName: null, sessions: [] });
  const [connection, setConnection] = useState(true);
  const [feed, setFeed] = useState<FeedEntry[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [demo, setDemo] = useState<Demo>({ running: false, runId: null, title: null });
  const [pick, setPick] = useState<PickAsk | null>(null);
  const [agentStatus, setAgentStatus] = useState<{ state: string; name: string; at: number } | null>(null);
  const fresh = useRef(new Set<number>()); /* agent messages that arrived live: they type themselves out */
  const hand = useValue('agent hand', () => handAtom.get(), []);
  const boardNow = useCanvasBoard();
  const runningN = useValue('running cards', () => (boardNow && !boardNow.disposed ? boardNow.nodes().filter((x) => x.type === 'ohf-gen' && (x.props as any).status === 'running').length : 0), [boardNow]);
  const [text, setText] = useDraftField('canvas-agent', 'prompt', ''); /* an unsent message survives a reload (2026-10-27) */ const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState<Record<string, 'go' | 'cancel'>>({});
  const [rerolling, setRerolling] = useState<Record<string, boolean>>({});
  const [sheet, setSheet] = useState(false);
  const [chipsOpen, setChipsOpen] = useState(false); /* the demo chips: the first CHIPS_SHOWN, then "4 more" opens the rest inline; a pick folds them again */
  const [glow, setGlow] = useState<{ left: number; top: number; width: number; height: number; key: number } | null>(null);
  const [tick, setTick] = useState(0);
  /* pictures added to the next message (2026-11-03): paperclip, paste or a drop on the dock; each becomes an Upload card when you send */
  const [pics, setPics] = useState<{ key: string; file: File; preview: string }[]>([]); const [dropOver, setDropOver] = useState(false); const fileIn = useRef<HTMLInputElement>(null);
  const picsRef = useRef(pics); picsRef.current = pics;
  useEffect(() => () => { for (const x of picsRef.current) URL.revokeObjectURL(x.preview); }, []);
  const addPics = useCallback((files: File[]) => {
    if (!files.length) return; const plan = planDockPictures(files, picsRef.current.length);
    const why = [...new Set(plan.refused.map((r) => r.why))]; if (why.length) toast(why.join(' '), 'warn');
    if (plan.take.length) setPics((prev) => [...prev, ...plan.take.map((i) => ({ key: `${Date.now().toString(36)}${i}${Math.random().toString(36).slice(2, 6)}`, file: files[i], preview: URL.createObjectURL(files[i]) }))].slice(0, MAX_DOCK_PICTURES));
  }, [toast]);
  const dropPic = (key: string) => setPics((prev) => prev.filter((x) => { if (x.key === key) URL.revokeObjectURL(x.preview); return x.key !== key; }));
  const feedBox = useRef<HTMLDivElement>(null); const stick = useRef(true); const glowTimer = useRef(0); const ta = useRef<HTMLTextAreaElement>(null);
  const demoRef = useRef(demo); demoRef.current = demo; const confirmRef = useRef<{ id: string; label: string; seq: number } | null>(null);

  useEffect(() => { fetch('/api/config').then((r) => (r.ok ? r.json() : null)).then((c) => setConfig(c ?? {})).catch(() => setConfig({})); }, []);
  useEffect(() => { const t = window.setInterval(() => setTick((x) => x + 1), 15_000); return () => window.clearInterval(t); }, []);
  const sessions = agent.sessions ?? [];
  const touchedFresh = !!agent.lastAgentAt && Date.now() - agent.lastAgentAt < AGENT_FRESH_MS;
  /* connected from the moment a client connects (its session), not only after its first call on this board */
  /* listening (2026-10-28) is the server's word: a wait is open on this board (or returned under ~70 s ago), or a channel session pushes; it
     sends a new presence when that lapses. Connected alone means a client is there but nothing reads what you type yet. */
  const agentListening = !!agent.listening;
  const agentConnected = agentListening || (agent.connected && (sessions.length > 0 || !agent.lastAgentAt || touchedFresh));
  const agentWorking = !agentListening && !!agent.working; /* building over MCP with no wait loop: "working on this board", not "isn't reading it" */
  const state = dockState({ connected: agentConnected || agentWorking, listening: agentListening, working: agentWorking });
  const agentLabel = agent.agentName || 'Your AI';
  const connectedLine = dockStatusLine(state, agentLabel, { sessions: sessions.length, via: agent.listenVia ?? null });
  const sessionNames = sessions.map((x) => x.name).join(', ');
  const onBoardsRef = useRef(onBoards); onBoardsRef.current = onBoards; const onOpenRef = useRef(onOpenBoard); onOpenRef.current = onOpenBoard;
  void tick;
  useEffect(() => { onBusy?.(demo.running); }, [demo.running, onBusy]);

  const mcpUrl = useMemo(() => { const raw = config?.mcp?.httpUrl as string | undefined; return raw ? raw.replace('127.0.0.1', 'localhost') : ''; }, [config]);

  const glowAt = useCallback((id?: string | null) => {
    if (!board || !id) return; const b = board.boundsOf(id as any); if (!b) return;
    const v = board.boardToViewport({ x: b.minX, y: b.minY }); const r = board.container().getBoundingClientRect(); const z = board.zoom();
    setGlow({ left: r.left + v.x, top: r.top + v.y, width: b.w * z, height: b.h * z, key: Date.now() });
    window.clearTimeout(glowTimer.current); glowTimer.current = window.setTimeout(() => setGlow(null), 1900);
  }, [board]);
  const focus = useCallback((id?: string | null) => {
    if (!board || !id) return; const s = board.getNode(id as any); if (!s) return;
    board.select([id as any]); const b = board.boundsOf(id as any); if (b) board.centerOn(b.center, { duration: 260 }); window.setTimeout(() => glowAt(id), 280);
  }, [board, glowAt]);
  const focusMany = useCallback((ids: string[]) => { if (!board) return; const live = ids.filter((id) => board.getNode(id as any)); if (!live.length) return; board.select(live); board.zoomToSelection({ duration: 320 }); }, [board]);

  useEffect(() => {
    if (!board) return;
    let closed = false;
    setFeed([]); setProposals([]);
    const base = `/api/canvas/boards/${encodeURIComponent(boardId)}/agent`;
    void (async () => {
      try {
        const [f, p, st] = await Promise.all([
          fetch(`${base}/feed?since=0&limit=240`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
          fetch(`${base}/proposals`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
          fetch(`${base}/state`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        ]);
        if (closed) return;
        if (Array.isArray(f?.items)) setFeed((prev) => mergeFeed(prev, f.items));
        if (Array.isArray(p?.items)) setProposals((prev) => mergeProposals(prev, p.items));
        if (st?.agent) setAgent(st.agent); if (st?.demo) setDemo(st.demo); if (st?.pick) setPick(st.pick);
      } catch { /* the dock still works live */ }
    })();
    const close = startAgentBridge(boardId, board, {
      onConnection: (o) => { if (!closed) setConnection(o); },
      onHello: (d) => { if (closed) return; if (d?.agent) setAgent(d.agent); if (d?.demo) setDemo(d.demo); setPick(d?.pick ?? null);
        /* after a reconnect (the app restarted) a quote the server no longer knows can't run: close it here, so no dead Go button stays */
        const live = new Set<string>(Array.isArray(d?.proposals) ? d.proposals.map((p: Proposal) => p.id) : []);
        setProposals((prev) => mergeProposals(prev.map((p) => (p.status === 'pending' && !live.has(p.id) && Date.now() - p.createdAt > 1500 ? { ...p, status: 'cancelled' as const } : p)), Array.isArray(d?.proposals) ? d.proposals : [])); },
      onPick: (p) => { if (!closed) setPick(p); },
      onAgentStatus: (st) => { if (!closed) setAgentStatus(st); },
      onBoards: () => { if (!closed) onBoardsRef.current?.(); },
      onOpenBoard: (d) => { if (!closed && d.boardId !== boardId) onOpenRef.current?.(d.boardId, d.name, d.by); },
      onPresence: (p) => { if (!closed && p) setAgent(p); },
      onDemo: (d) => { if (!closed && d) setDemo(d); },
      onFeed: (e) => {
        if (closed) return; if (e.type === 'message' && e.from === 'agent') fresh.current.add(e.seq); setFeed((prev) => mergeFeed(prev, [e]));
        /* the board itself shows the agent's hand (agentHand: cursor, glow, camera); the dock only remembers the newest cards */
        if (e.type === 'activity' && e.meta?.tool === 'add_card' && e.cardId) focusAdded(`${e.meta?.by ?? 'mcp'}:${demoRef.current.runId ?? ''}`, e.cardId, false);
      },
      onProposal: (p) => { if (!closed) { setProposals((prev) => mergeProposals(prev, [p])); focusCards(p.cardIds); } },
      onProposalUpdate: (p) => { if (closed) return; setProposals((prev) => mergeProposals(prev, [p])); if (p.status === 'approved') focusCards(p.cardIds); },
      onError: () => { /* EventSource reconnects */ },
    });
    return () => { closed = true; close(); };
  }, [boardId, board, glowAt]);

  /* Follow transcript growth (including TypedText and live media cards), not the board's Follow agent camera toggle.
     Immediate scrolling avoids smooth-scroll events mistaking an in-flight animation for a reader scrolling away. */
  /* the empty board's hello (intro + demo cards) reads from the top: only a conversation follows its newest line */
  const helloOnly = useRef(true);
  useEffect(() => {
    const el = feedBox.current; const transcript = el?.firstElementChild; if (!el || !transcript) return;
    const follow = () => { if (stick.current && !helloOnly.current) el.scrollTop = el.scrollHeight; };
    const observer = new ResizeObserver(follow); observer.observe(transcript); observer.observe(el); follow();
    return () => observer.disconnect();
  }, []);
  useEffect(() => { const el = feedBox.current; if (el && stick.current && !helloOnly.current) el.scrollTop = el.scrollHeight; }, [feed.length, proposals]);

  /** The attached pictures become Upload cards (the same card a board drop makes, named after the file) beside what you selected, or in view.
   *  Each uploads on its own: one refused says why and the others still land. Uploading is free; nothing runs. */
  const placePics = async (items: { file: File }[]): Promise<DockPicture[]> => {
    if (!items.length || !board) return [];
    const urls = await Promise.all(items.map(async ({ file }) => { try { const [m] = await uploadMedia([file]); if (!m?.url) throw new Error('Upload failed'); return m.url; }
      catch (e) { toast(`${file.name}: ${(e as Error).message || 'Upload failed'}`, 'error'); return null; } }));
    const { defaultW: w, defaultH: h } = NODE_DEFS.upload; const sel = board.selectionBounds();
    let near = sel ? { x: sel.maxX + 60 + w / 2, y: sel.minY + h / 2 } : board.viewportBounds().center; const out: DockPicture[] = [];
    items.forEach(({ file }, i) => { const url = urls[i]; if (!url) return; const name = pictureName(file.name);
      const id = createAuxNode(board, 'upload', { at: freeSpot(board, w, h, near), select: false, media: { url, poster: mediaPoster('image', url), mediaKind: 'image', label: name } });
      const b = board.boundsOf(id); if (b) near = { x: b.maxX + 40 + w / 2, y: b.center.y };
      out.push({ card_id: id, name, url }); });
    return out;
  };
  const send = async (raw: string, starter?: StarterId, confirmId?: string) => {
    const body = raw.trim(); const attached = starter || confirmId ? [] : picsRef.current; if ((!body && !attached.length) || sending) return; setSending(true); stick.current = true;
    const base = `/api/canvas/boards/${encodeURIComponent(boardId)}/agent`;
    try {
      const route = dockRoute({ connected: agentConnected, demoRunning: demoRef.current.running, confirmWaiting: !!confirmRef.current });
      /* while the demo waits for your OK, what you type is the answer (an edit, or Looks good) */
      /* your connected agent gets what you selected as context (card ids, names, workflow, status), plus the pictures you added */
      const selected = agentConnected && board ? board.selection().slice(0, 50) : [];
      const pictures = await placePics(attached);
      if (attached.length) { for (const x of attached) URL.revokeObjectURL(x.preview); setPics([]); }
      if (attached.length && !pictures.length) throw new Error('The pictures could not be added. Nothing was sent.');
      if (board && pictures.length) board.select([...selected, ...pictures.map((p) => p.card_id)]);
      const ids = [...selected, ...pictures.map((p) => p.card_id).filter((id) => !selected.includes(id as any))].slice(0, 50);
      const selection = agentConnected && board ? ids.map((id) => { const s: any = board.getNode(id as any); return { id, name: cardNameOf(board, id as any) ?? null, type: s?.type ?? (board.getLink(id) ? 'arrow' : null), workflow: s?.props?.flow ?? null, status: s?.props?.status ?? null }; }) : [];
      /* no agent reads the dock: the pictures are on the board, and only typed words go on to the demo */
      if (!body && (!agentConnected || route !== 'messages')) { toast(pictures.length === 1 ? 'Added the picture to the board.' : `Added ${pictures.length} pictures to the board.`); return; }
      const r = route === 'messages'
        ? await fetch(`${base}/messages`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: body, ...(confirmId ? { confirm_id: confirmId } : {}), ...(selection.length ? { selection } : {}), ...(agentConnected && pictures.length ? { pictures } : {}) }) })
        : await fetch(`${base}/demo`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: body, ...(starter ? { starter } : {}) }) });
      const b = await r.json().catch(() => ({})); if (!r.ok) throw new Error(b?.error || 'Could not send that.');
      if (b?.message) setFeed((prev) => mergeFeed(prev, [b.message]));
      if (b?.reply) setFeed((prev) => mergeFeed(prev, [b.reply])); /* the built-in demo can't chat: its honest reply (server canvasDemo.demoReply) */
      /* a demo starting turns Follow agent on, so the camera shows what it builds */
      if (b?.runId) { setFollow(true); setDemo({ running: true, runId: b.runId, title: b.plan?.title ?? null }); }
      if (!b?.kept) setText(''); /* words the demo couldn't take stay in the box, ready for Claude once it's connected */
    } catch (e) { setText(body); toast((e as Error).message, 'error'); }
    finally { setSending(false); }
  };
  /* Explore's "Ask an agent" (2026-10-26): /canvas?ask=<words> sends them once the agent's status is in (an MCP agent if one is connected,
     else the built-in demo). The agent plans and quotes; nothing runs until Go. */
  const sendNow = useRef(send); sendNow.current = send;
  useEffect(() => {
    const words = ask.trim().slice(0, 4000); if (!words || askedOnce.has(words)) return; askedOnce.add(words);
    const q = new URLSearchParams(location.search); if (q.has('ask')) { q.delete('ask'); history.replaceState(history.state, '', location.pathname + (q.toString() ? `?${q}` : '')); }
    window.setTimeout(() => { void sendNow.current(words); }, 1200);
  }, [ask]);

  /* the agent's name on its cursor */
  useEffect(() => { setAgentName(agentConnected ? agent.agentName || 'Your AI' : 'Agent'); }, [agentConnected, agent.agentName]);
  /* the hand leaves a moment after the demo ends (or right away when you stop it) */
  useEffect(() => { if (!board || demo.running) return; const t = window.setTimeout(() => handOf(board).leave(), 2600); return () => window.clearTimeout(t); }, [board, demo.running]);
  useEffect(() => () => { if (board) handOf(board).leave(); }, [board]); /* the dock closes (board switch): the hand goes with it */
  /* pick one: the choices pulse on the board until one is chosen; a click on one of them (it becomes the only selection) is the choice */
  const choose = useCallback(async (cardId: string) => {
    const pk = pickRef.current; if (!pk || pk.status !== 'waiting' || !pk.cardIds.includes(cardId) || choosing.current) return; choosing.current = true;
    try {
      const r = await fetch(`/api/canvas/boards/${encodeURIComponent(boardId)}/agent/pick`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pick_id: pk.id, card_id: cardId, ...(board ? { title: cardNameOf(board, cardId as any) ?? undefined } : {}) }) });
      const b = await r.json().catch(() => ({})); if (!r.ok) throw new Error(b?.error || 'Could not save your pick.');
      if (b?.pick) setPick(b.pick);
    } catch (e) { toast((e as Error).message, 'error'); } finally { choosing.current = false; }
  }, [boardId, board, toast]);
  const pickRef = useRef(pick); pickRef.current = pick; const choosing = useRef(false); const pickSaid = useRef(false);
  /* the pulse and the "Waiting for your pick" label follow the server's PickAsk.status only: they clear on a pick, a cancel, the server's
     timeout, or when this board closes. Only a click on one of the cards AFTER the ask counts (pickFromSelection); a card that was already
     selected, a camera move or hovering the dock picks nothing, and nothing moves the camera or opens a panel (the edge chip does, on click). */
  useEffect(() => {
    if (!board) return;
    const waitingNow = pick?.status === 'waiting';
    if (waitingNow) { fx.pick(livePickChoices(pick!.cardIds, (id) => !!board.getNode(id as any))); handOf(board).say('Waiting for your pick', true); pickSaid.current = true; }
    else { fx.pick([]); if (pick?.status === 'picked' && pick.chosen) fx.chosen(pick.chosen); if (pickSaid.current) { pickSaid.current = false; handOf(board).hush(); } } /* the pick resolved: the label goes with it */
    if (!waitingNow) return;
    let before = [...board.selection()]; let pressed = false;
    const offIn = board.onInput((e) => { if (e.kind === 'pointer_down') pressed = true; });
    const offView = board.onChange(() => { const now = board.selection(); const id = pickFromSelection({ before, now, choices: pick!.cardIds, pressedSinceAsk: pressed }); before = [...now]; if (id) void choose(id); }, 'view');
    /* a choice you delete drops out of the pulse */
    const offDoc = board.onChange(() => fx.pick(livePickChoices(pick!.cardIds, (id) => !!board.getNode(id as any))), 'board');
    return () => { offIn(); offView(); offDoc(); fx.pick([]); if (pickSaid.current) { pickSaid.current = false; handOf(board).hush(); } };
  }, [board, pick, choose]);
  useEffect(() => () => fx.pick([]), []);

  const stop = async () => {
    if (board) handOf(board).leave(); /* the hand goes at once, not after the demo's last step */
    try { await fetch(`/api/canvas/boards/${encodeURIComponent(boardId)}/agent/demo/stop`, { method: 'POST' }); setDemo({ running: false, runId: null, title: null }); }
    catch { toast('Could not stop the agent. Try again.', 'error'); }
  };
  const decide = async (p: Proposal, decision: 'go' | 'cancel') => {
    setBusy((b) => ({ ...b, [p.id]: decision }));
    try {
      const r = await fetch(`/api/canvas/boards/${encodeURIComponent(boardId)}/agent/proposals/${encodeURIComponent(p.id)}/decision`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ decision }) });
      const b = await r.json().catch(() => ({})); if (!r.ok) throw new Error(b?.error || 'Could not do that.');
      if (b?.proposal) setProposals((prev) => mergeProposals(prev, [b.proposal]));
      if (decision === 'cancel') toast('Cancelled. Nothing ran.');
    } catch (e) { toast((e as Error).message, 'error'); }
    finally { setBusy((b) => { const n = { ...b }; delete n[p.id]; return n; }); }
  };
  const reroll = async (cardId: string, title: string) => {
    setRerolling((m) => ({ ...m, [cardId]: true })); stick.current = true;
    try {
      const r = await fetch(`/api/canvas/boards/${encodeURIComponent(boardId)}/agent/proposals`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ card_ids: [cardId], note: `Re-roll “${title.slice(0, 60)}”` }) });
      const b = await r.json().catch(() => ({})); if (!r.ok) throw new Error(b?.error || 'Could not price that.');
      if (b?.proposal) setProposals((prev) => mergeProposals(prev, [b.proposal]));
    } catch (e) { toast((e as Error).message, 'error'); }
    finally { setRerolling((m) => { const n = { ...m }; delete n[cardId]; return n; }); }
  };
  const pickStarter = (id: StarterId) => { setChipsOpen(false); const s = STARTERS.find((x) => x.id === id); if (s) void send(s.prompt, id); };

  const byId = useMemo(() => new Map(proposals.map((p) => [p.id, p])), [proposals]);
  const plan = useMemo(() => planOf(feed), [feed]);
  const confirm = useMemo(() => (demo.running ? confirmOf(feed) : null), [feed, demo.running]); confirmRef.current = confirm;
  const pairs = useMemo(() => repricePairs(proposals), [proposals]);
  const shown = feed.filter((e) => e.type !== 'proposal' && !hiddenByReprice(e, byId, pairs)); /* a price stop is said once, by its card */
  const who = agentConnected ? agent.agentName || 'Your AI' : 'Agent';
  const last = shown.at(-1);
  const waiting = proposals.some((p) => p.status === 'pending');
  const pickWaiting = pick?.status === 'waiting';
  /* your agent picked up your message: "Claude is planning…" until it replies (or 3 minutes pass) */
  const lastAgentMsg = [...feed].reverse().find((e) => e.type === 'message' && e.from === 'agent'); const lastAgentMsgAt = lastAgentMsg?.at ?? 0;
  /* your messages since its last reply: waiting / sent / read (only while a real agent is the one you talk to) */
  const statusOf = (e: FeedEntry): MsgStatus => (agentConnected ? messageStatus(e, lastAgentMsg?.seq ?? 0) : null);
  const agentPlanning = agentConnected && !!agentStatus && agentStatus.at > lastAgentMsgAt && Date.now() - agentStatus.at < 180_000;
  const thinking = (demo.running && !waiting && !pickWaiting && !confirm && !(last?.type === 'message' && last.meta?.finished)) || agentPlanning;
  /* the built-in demo's honest reply to typed words: the matching demo as one chip under it (only the newest, while nothing runs) */
  const suggest = !demo.running && !agentConnected && last?.type === 'message' && last.meta?.demoReply ? STARTERS.find((x) => x.id === last.meta?.suggest) ?? null : null;
  const empty = shown.length === 0; helloOnly.current = empty;

  return <>
    <aside className={`ap${open ? ' on' : ''}`} data-testid="agent-panel" aria-hidden={!open} aria-label="AI agent"
      onDragOver={(ev) => { if (!ev.dataTransfer.types.includes('Files')) return; ev.preventDefault(); ev.dataTransfer.dropEffect = 'copy'; if (!dropOver) setDropOver(true); }}
      onDragLeave={(ev) => { if (!ev.currentTarget.contains(ev.relatedTarget as Node | null)) setDropOver(false); }}
      onDrop={(ev) => { if (!ev.dataTransfer.files.length) return; ev.preventDefault(); setDropOver(false); addPics([...ev.dataTransfer.files]); }}>
      <header className="ap-head">
        <div className="ap-brand"><span className="ap-mark"><SparkleIcon size={16} /></span><div><b>Agent</b><small data-testid="agent-mode" title={sessions.length > 1 ? sessionNames : connectedLine}>{connectedLine}</small></div></div>
        <div className="ap-head-r">
          <span className={`ap-status${agentListening ? ' on' : agentWorking ? ' on work' : agentConnected ? ' idle' : ' demo'}`} data-testid="agent-status" data-state={state === 'off' ? 'demo' : state} {...tip(agentListening ? `${agentLabel} reads what you type here` : agentWorking ? `${agentLabel} is building on this board. What you type waits until it listens` : agentConnected ? `${sessionNames || agentLabel}: connected, not reading this board yet. What you type waits here` : 'Starters play the built-in demo. Connect your own AI for a real one')}><i />{dockPill(state)}</span>
          <button type="button" className="ap-icon" aria-label="Connect your own AI" {...tip(SAMPLE_SITE ? 'Connect your AI in the app on your computer' : 'Connect your own AI (MCP)')} disabled={SAMPLE_SITE} onClick={() => setSheet(true)} data-testid="agent-connect"><ApiPlugIcon size={16} /></button>
          <button type="button" className="ap-icon" aria-label="Hide the AI panel" {...tip('Hide the AI panel')} onClick={onClose} data-testid="agent-collapse"><ChevronLeftIcon size={16} /></button>
        </div>
      </header>
      <div className="ap-body">
        <div className="ap-feed" ref={feedBox} role="log" tabIndex={0} aria-label="Agent conversation" data-testid="agent-feed"
          onScroll={() => { const el = feedBox.current; stick.current = el ? el.scrollHeight - el.scrollTop - el.clientHeight < 80 : true; }}>
          <div className="ap-transcript">
          {plan?.tracker && !empty && (demo.running || plan.finished) && <StepTracker steps={plan.steps} done={plan.done} finished={plan.finished} live={demo.running} />}
          {empty ? <div className="ap-hello" data-testid="agent-hello">
            <span className="ap-hello-mark"><SparkleIcon size={22} /></span>
            <h2>What would you like to make?</h2>
            {agentConnected ? <p data-testid="agent-hello-connected">{agentListening ? `${agentLabel} is listening.` : `${agentLabel} is connected.`} Tell it what to make; select cards first to point at them. Every paid step waits for your OK.</p>
              : SAMPLE_SITE ? <SampleSiteNote testId="agent-sample-note">{AGENT_NOTE}</SampleSiteNote>
              : <><p>Pick a demo to watch the board build, or connect Claude to talk about your board. Every paid step waits for your OK.</p>
                <Starters onPick={pickStarter} disabled={sending || demo.running} />
                <button type="button" className="ap-connect" data-testid="agent-connect-offer" onClick={() => setSheet(true)}><ApiPlugIcon size={15} /><span><b>Connect your agent</b><small>Claude Code, Claude Desktop or any MCP client becomes the brain here</small></span></button></>}
          </div> : shown.map((e) => {
            if (e.type === 'message') {
              if (Array.isArray(e.meta?.plan)) return <div key={e.id} className="ap-group"><Message e={e} who={who} live={fresh.current.has(e.seq)} />
                <PlanCard title={String(e.meta.title ?? 'Plan')} steps={e.meta.plan} done={plan?.seq === e.seq ? plan.done : e.meta.plan.length} finished={plan?.seq === e.seq ? plan.finished : true} live={plan?.seq === e.seq && demo.running} /></div>;
              if (e.meta?.pick?.cardIds) return <div key={e.id} className="ap-group"><Message e={e} who={who} live={fresh.current.has(e.seq)} /><PickCard e={e} pick={pick} board={board} onPick={(id) => void choose(id)} onFocus={focus} onGlow={(id) => { if (!board) return; const b = board.boundsOf(id as any); if (b && !pickOffscreen([b], board.viewportBounds())) glowAt(id); }} /></div>;
              if (e.meta?.confirm?.id && confirm?.id === e.meta.confirm.id) return <div key={e.id} className="ap-group"><Message e={e} who={who} live={fresh.current.has(e.seq)} /><ConfirmCard label={confirm!.label} busy={sending} onOk={() => void send(confirm!.label, undefined, confirm!.id)} /></div>;
              if (suggest && e === last) return <div key={e.id} className="ap-group"><Message e={e} who={who} live={fresh.current.has(e.seq)} />
                <button type="button" className="ap-chip ap-chip-main" disabled={sending} onClick={() => pickStarter(suggest.id)} data-testid="agent-suggest">Want to see “{suggest.label}”?</button></div>;
              return <Message key={e.id} e={e} who={who} live={fresh.current.has(e.seq)} status={statusOf(e)} onFocus={focus} />;
            }
            if (e.type === 'activity' && e.meta?.tool === 'add_card' && e.cardId) return <AgentMediaCard key={e.id} board={board} cardId={e.cardId} meta={{ ...e.meta, title: e.text.replace(/^Added “|”$/g, '') }} onFocus={focus} onReroll={(id, t) => void reroll(id, t)} rerolling={!!rerolling[e.cardId]} />;
            if (e.type === 'activity' && e.proposalId && /^Proposed/.test(e.text)) { const p = byId.get(e.proposalId);
              if (p && isPriceStop(p)) return <RepriceCard key={e.id} origin={p} child={pairs.childOf.get(p.id) ?? null} board={board} busy={busy[pairs.childOf.get(p.id)?.id ?? '']} onDecide={(x, d) => void decide(x, d)} onFocus={focusMany} />;
              return p ? <ProposalCard key={e.id} p={p} busy={busy[p.id]} onDecide={(d) => void decide(p, d)} onFocus={focusMany} /> : <EventRow key={e.id} e={e} onFocus={focus} />; }
            return <EventRow key={e.id} e={e} onFocus={focus} />;
          })}
          {thinking && <div className="ap-typing" data-testid="agent-working" aria-live="polite"><i /><i /><i /><span>{agentPlanning && !hand.working ? `${agentStatus!.name} is planning…` : hand.working && hand.label ? `${hand.label}…` : runningN ? `Waiting for ${runningN === 1 ? 'the result' : `${runningN} results`}…` : 'Thinking…'}</span></div>}
          {pickWaiting && <div className="ap-typing wait" data-testid="agent-waiting-pick" aria-live="polite"><span>Waiting for your pick</span></div>}
          {!connection && !SAMPLE_SITE && <p className="ap-conn-note">The canvas connection dropped. Reconnecting…</p>}
          </div>
        </div>
        <form className="ap-compose" onSubmit={(ev) => { ev.preventDefault(); void send(text); }}>
          {state === 'connected' && <ListenHint boardId={boardId} name={agentLabel} onSetup={() => setSheet(true)} />}
          {state === 'working' && <p className="ap-working" data-testid="agent-working-note" aria-live="polite"><i aria-hidden /><span><b>{workingLine(agentLabel)}.</b> What you type waits until it listens.</span></p>}
          {!SAMPLE_SITE && !empty && !demo.running && !agentConnected && <div className="ap-chips" aria-label="Starters">{(chipsOpen ? STARTERS : STARTERS.slice(0, CHIPS_SHOWN)).map((s) => <button key={s.id} type="button" className="ap-chip" disabled={sending} onClick={() => pickStarter(s.id)} data-testid={`agent-chip-${s.id}`}>{s.label}</button>)}
            {!chipsOpen && STARTERS.length > CHIPS_SHOWN && <button type="button" className="ap-chip ap-chip-more" onClick={() => setChipsOpen(true)} aria-expanded={false} data-testid="agent-chips-more">{STARTERS.length - CHIPS_SHOWN} more</button>}</div>}
          {pics.length > 0 && <div className="ap-atts" role="list" aria-label="Pictures to send" data-testid="agent-attachments">{pics.map((x) => <span key={x.key} role="listitem" className="ap-att" title={x.file.name}>
            <img src={x.preview} alt={pictureName(x.file.name)} draggable={false} /><button type="button" className="ap-att-x" onClick={() => dropPic(x.key)} aria-label={`Remove ${pictureName(x.file.name)}`} data-testid="agent-attachment-remove"><CloseIcon size={11} /></button></span>)}</div>}
          <div className="ap-box">
            <input ref={fileIn} type="file" accept={IMAGE_ACCEPT} multiple hidden data-testid="agent-attach-input" onChange={(e) => { addPics([...(e.target.files ?? [])]); e.target.value = ''; }} />
            {!SAMPLE_SITE && <button type="button" className="ap-attach" onClick={() => fileIn.current?.click()} disabled={sending || pics.length >= MAX_DOCK_PICTURES} aria-label="Add pictures" {...tip(pics.length >= MAX_DOCK_PICTURES ? `Up to ${MAX_DOCK_PICTURES} pictures per message` : 'Add pictures')} data-testid="agent-attach"><PaperclipIcon size={16} /></button>}
            <textarea ref={ta} value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={4000} disabled={SAMPLE_SITE}
              onPaste={(e) => { const files = [...e.clipboardData.files]; if (!files.length) return; e.preventDefault(); e.stopPropagation(); /* the board never also gets it */ addPics(files); }}
              placeholder={confirm ? 'What should change? Or press Looks good.' : agentConnected ? `Message ${agent.agentName || 'your AI'}…` : SAMPLE_SITE ? 'The agent runs in the app on your computer' : 'Pick a demo, or connect Claude to chat'} aria-label="Message the agent" data-testid="agent-reply"
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(text); } }} />
            {demo.running && !agentConnected && !text.trim() && !pics.length
              ? <button type="button" className="ap-send stop" onClick={() => void stop()} aria-label="Stop the agent" {...tip('Stop. Cards already on the board stay')} data-testid="agent-stop"><StopIcon size={15} /></button>
              : <button type="submit" className="ap-send" disabled={(!text.trim() && !pics.length) || sending} aria-label="Send" data-testid="agent-send"><SendIcon size={16} /></button>}
          </div>
          <p className="ap-hint">{agentListening ? `Goes straight to ${agentLabel}. Canvas proposals wait for your Go.` : agentConnected ? `Waits here until ${agentLabel} reads it. Canvas proposals wait for your Go.` : SAMPLE_SITE ? 'Add cards by hand and press Go for a sample.' : 'Demos build drafts on this board. Every run waits for your Go.'}</p>
        </form>
      </div>
      {dropOver && <div className="ap-dropzone" data-testid="agent-dropzone" aria-hidden><span><PaperclipIcon size={18} />Drop pictures to add them</span></div>}
      {sheet && <ConnectSheet config={config} mcpUrl={mcpUrl} onClose={() => setSheet(false)} boardId={boardId} />}
    </aside>
    {board && pick?.status === 'waiting' && <PickEdgeChip board={board} ids={pick.cardIds} who={agentConnected ? agentLabel : 'Agent'} />}
    {glow && createPortal(<div className="ap-glow" key={glow.key} style={{ left: glow.left, top: glow.top, width: glow.width, height: glow.height }} aria-hidden />, document.body)}
  </>;
}
