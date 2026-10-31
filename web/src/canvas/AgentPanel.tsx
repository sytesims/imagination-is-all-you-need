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
import type { Editor } from 'tldraw';
import { useValue } from 'tldraw';
import { useCanvasEditor } from './agentApi';
import { useCatalog, catalogNow } from './catalog';
import { startAgentBridge, nameOf as cardNameOf, type FeedEntry, type Proposal, type PickAsk } from './agentBridge';
import { handAtom, handOf, fx, setAgentName, reducedMotion } from './agentHand';
import { flowById, flowInfo } from '../shared/genFlows';
import { LOCAL_FREE } from '../../../server/src/shared/modelIds';
import { STARTERS, mergeFeed, mergeProposals, planOf, confirmOf, focusAdded, focusCards, setFollow, agentStarterPrompt, dockRoute, dockState, dockStatusLine, dockPill, workingLine, messageStatus, messageStatusText, listenCommand, LISTEN_PHRASE, type StarterId, type MsgStatus } from './agentDockModel';
import { AgentMediaCard } from './AgentMediaCard';
import { useCopied, Copied, useToast } from '../shared/Toast';
import { GenPrice } from '../shared/GenPrice';
import { tip } from '../shared/Tooltip';
import { SparkleIcon, CloseIcon, TrashIcon, DirectorIcon, ProductIcon, ExtendIcon, ExploreIcon, VideoIcon, ApiPlugIcon, MaterialIcon } from '../ui/Icons';
import { CopyIcon, PlusIcon, ArrowIcon, RetryIcon, CoinIcon, ChevronLeftIcon, CheckIcon, StopIcon, SendIcon, NoteIcon, GroupIcon } from './icons';
import { useProfile, nameOf, UserAvatar } from '../shared/profile';
import './agentPanel.css';

const AGENT_FRESH_MS = 90_000; /* the server's window: an agent that stopped waiting or polling for 90 s isn't listening any more */
const time = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const STARTER_ICON: Record<StarterId, (p: { size?: number }) => JSX.Element> = { short: SparkleIcon, film: DirectorIcon, product: ProductIcon, animate: ExtendIcon, takes: VideoIcon, material: MaterialIcon, free: ExploreIcon };
type Demo = { running: boolean; runId: string | null; title: string | null };

/** Board.tsx puts the editor in agentApi's context; the dock lives outside <Tldraw>, so wait for a live one (after a board switch the
 *  context can still hold the previous board's editor for a moment: a disposed editor never counts). */
function useEditorReady(): Editor | null {
  const live = () => { const e = useCanvasEditor(); return e && !e.isDisposed ? e : null; };
  const [editor, setEditor] = useState<Editor | null>(live);
  useEffect(() => {
    if (editor && !editor.isDisposed) { const t = window.setInterval(() => { if (editor.isDisposed) setEditor(live()); }, 500); return () => window.clearInterval(t); }
    const t = window.setInterval(() => { const e = live(); if (e) { setEditor(e); window.clearInterval(t); } }, 120);
    return () => window.clearInterval(t);
  }, [editor]);
  return editor && !editor.isDisposed ? editor : null;
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
function Message({ e, who, live = false, status = null }: { e: FeedEntry; who: string; live?: boolean; /** your message: waiting / sent / read (2026-10-28) */ status?: MsgStatus }) {
  const agent = e.from === 'agent';
  return <div className={`ap-msg ${agent ? 'agent' : 'user'}${e.meta?.error ? ' err' : ''}${live ? ' fresh' : ''}`} data-testid="agent-message">
    <div className="ap-msg-h">{agent ? <span className="ap-who"><i className="ap-who-mark"><SparkleIcon size={11} /></i>{who}</span> : <MeLabel />}<time>{time(e.at)}</time></div>
    <p aria-label={agent && live ? e.text : undefined}>{agent ? <TypedText text={e.text} live={live} /> : e.text}</p>
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

/** "Pick the one you like": the cards as small thumbnails with a Pick button each; clicking a card on the board does the same. */
function PickCard({ e, pick, editor, onPick, onFocus }: { e: FeedEntry; pick: PickAsk | null; editor: Editor | null; onPick: (cardId: string) => void; onFocus: (id: string) => void }) {
  const ids: string[] = e.meta?.pick?.cardIds ?? []; const live = !!pick && pick.id === e.meta?.pick?.id; const waiting = live && pick!.status === 'waiting'; const chosen = live ? pick!.chosen : null;
  const cards = useValue('pick cards', () => ids.map((id) => { const s = editor?.getShape(id as any); const p: any = s?.props; const t = p?.takes?.[p?.take ?? 0];
    return { id, here: !!s, name: (editor && cardNameOf(editor, id as any)) || String(p?.prompt ?? 'Card').slice(0, 40), poster: t?.poster || (t?.kind === 'image' ? t.url : '') || '' }; }), [editor, ids.join(',')]);
  return <section className={`ap-pick${waiting ? ' waiting' : ''}`} data-testid="agent-pick" data-state={waiting ? 'waiting' : chosen ? 'picked' : 'closed'}>
    <div className="ap-pick-h"><span className="ap-kicker">{waiting ? 'Your pick' : chosen ? 'You picked' : 'Pick one'}</span>{waiting && <small>Click one here or on the board</small>}</div>
    <div className="ap-pick-row" role="list">{cards.map((c) => <button key={c.id} type="button" role="listitem" className={`ap-pick-it${chosen === c.id ? ' on' : ''}${chosen && chosen !== c.id ? ' off' : ''}`} data-testid="agent-pick-item"
      disabled={!c.here || (!waiting && !chosen)} aria-pressed={chosen === c.id} onClick={() => (waiting ? onPick(c.id) : onFocus(c.id))} onMouseEnter={() => waiting && onFocus(c.id)}
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

function ProposalCard({ p, busy, onDecide, onFocus }: { p: Proposal; busy?: 'go' | 'cancel'; onDecide: (d: 'go' | 'cancel') => void; onFocus: (ids: string[]) => void }) {
  const pending = p.status === 'pending';
  /* rows that can't run here are skipped, not a blocker: Go starts the rest (server: proposal.runCardIds). Older proposals without it: every problem-free row. */
  const runIds = new Set(p.runCardIds ?? p.items.filter((i) => !i.problem).map((i) => i.cardId)); const nRun = runIds.size; const nSkip = p.items.length - nRun;
  const disabled = p.overBudget || !!p.reason || nRun === 0;
  const runItems = p.items.filter((i) => runIds.has(i.cardId)); const nRuns = runItems.reduce((a, i) => a + (Number(i.quote?.runs) > 1 ? Number(i.quote.runs) : 1), 0); /* a Material Swap card runs once per swatch */ const allDemo = runItems.length > 0 && runItems.every((i) => i.quote?.demo === true);
  const budget = p.budget;
  return <article className={`ap-prop ${p.status}`} data-testid="agent-proposal" data-status={p.status}>
    <div className="ap-prop-h"><span className="ap-kicker">{pending ? 'Needs your OK' : p.status === 'running' ? 'Starting' : p.status === 'approved' ? 'Approved' : p.status === 'cancelled' ? 'Cancelled' : 'Could not start'}</span>
      <button type="button" className="ap-prop-n" onClick={() => onFocus(p.cardIds)} {...tip('Show these cards on the board')}>{nRuns} run{nRuns === 1 ? '' : 's'}{nSkip ? ` · ${nSkip} skipped` : ''}</button></div>
    {p.note && <p className="ap-prop-note">{p.note}</p>}
    <ul className="ap-items">{p.items.map((it, i) => {
      const q = it.quote; const free = q?.localRun === true || q?.cost?.billedTo === 'local'; const demo = q?.demo === true;
      const skip = !runIds.has(it.cardId);
      return <li key={it.cardId} className={skip ? 'has-problem' : ''} data-testid="agent-proposal-item" data-skipped={skip ? '1' : undefined}>
        <span className="ap-item-n">{i + 1}</span>
        <div className="ap-item-t"><b>{it.title}</b><small>{(() => { const f = flowById(it.workflow); return f ? flowInfo(f, catalogNow()).name : 'Card'; })() /* a workflow card's own name (Material Swap), not its id */}{it.model ? ` · ${it.model}` : ''}{Number(it.quote?.runs) > 1 ? ` · ${it.quote.runs} swatches` : ''}</small>{skip && <small className="ap-item-why" title={it.problem ?? undefined}>{it.problem ?? "Can't run here"}</small>}</div>
        <span className="ap-item-p">{skip ? <em className="ap-item-skip">Skipped</em> : q ? <GenPrice q={q} credits={it.credits} demo={demo} free={free} compact /> : <em>—</em>}</span>
      </li>;
    })}</ul>
    <div className="ap-total"><span>Total</span><b data-testid="agent-proposal-total">{nRun === 0 ? '—' : totalWords(runItems, p.totalUsd)}</b></div>
    {budget?.remainingUsd != null && <div className="ap-budget"><span>Agent budget left</span><b>${budget.remainingUsd.toFixed(2)} of ${(budget.budgetUsd ?? 0).toFixed(2)}</b></div>}
    {p.reason && <p className={`ap-warn${p.overBudget ? ' over' : ''}`} data-testid="agent-proposal-reason">{p.reason}</p>}
    {!p.reason && nSkip > 0 && pending && <p className="ap-skipnote" data-testid="agent-proposal-skipped">{nSkip === 1 ? '1 card can’t run here, so Go skips it.' : `${nSkip} cards can’t run here, so Go skips them.`} Nothing is charged for {nSkip === 1 ? 'it' : 'them'}.</p>}
    {p.error && <p className="ap-warn over">{p.error}</p>}
    {pending && <div className="ap-prop-actions">
      <button type="button" className="ap-go" data-testid="agent-go" disabled={disabled || !!busy} onClick={() => onDecide('go')}>{busy === 'go' ? 'Starting…' : `Go${allDemo || p.totalUsd <= 0 ? '' : ` · ≈ $${p.totalUsd.toFixed(2)}`}`}</button>
      <button type="button" className="ap-cancel" data-testid="agent-cancel" disabled={!!busy} onClick={() => onDecide('cancel')}>{busy === 'cancel' ? 'Cancelling…' : 'Cancel'}</button>
    </div>}
    {p.status === 'running' && <p className="ap-prop-state">Starting the runs…</p>}
    {p.status === 'approved' && <p className="ap-prop-state ok">Approved · {p.jobIds.length} run{p.jobIds.length === 1 ? '' : 's'} started</p>}
    {p.status === 'cancelled' && <p className="ap-prop-state">Cancelled. Nothing ran.</p>}
    {p.status === 'failed' && <p className="ap-prop-state bad">Nothing ran. {p.error}</p>}
  </article>;
}

/** The proposal total in the same tokens as every Generate button (GenPrice / billing.priceToken): Sample, Free · this computer, ≈ $0.42. */
export function totalWords(items: { quote: any }[], totalUsd: number): string {
  if (items.length && items.every((i) => i.quote?.demo === true)) return 'Sample';
  if (totalUsd > 0) return `≈ $${totalUsd.toFixed(2)}`;
  return items.length && items.every((i) => i.quote?.localRun === true || i.quote?.cost?.billedTo === 'local') ? LOCAL_FREE : 'Free';
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
  const editor = useEditorReady(); useCatalog(); const toast = useToast();
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
  const editorNow = useCanvasEditor();
  const runningN = useValue('running cards', () => (editorNow && !editorNow.isDisposed ? editorNow.getCurrentPageShapes().filter((x) => x.type === 'ohf-gen' && (x.props as any).status === 'running').length : 0), [editorNow]);
  const [text, setText] = useDraftField('canvas-agent', 'prompt', ''); /* an unsent message survives a reload (2026-10-27) */ const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState<Record<string, 'go' | 'cancel'>>({});
  const [rerolling, setRerolling] = useState<Record<string, boolean>>({});
  const [sheet, setSheet] = useState(false);
  const [glow, setGlow] = useState<{ left: number; top: number; width: number; height: number; key: number } | null>(null);
  const [tick, setTick] = useState(0);
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
    if (!editor || !id) return; const b = editor.getShapePageBounds(id as any); if (!b) return;
    const v = editor.pageToViewport({ x: b.minX, y: b.minY }); const r = editor.getContainer().getBoundingClientRect(); const z = editor.getZoomLevel();
    setGlow({ left: r.left + v.x, top: r.top + v.y, width: b.w * z, height: b.h * z, key: Date.now() });
    window.clearTimeout(glowTimer.current); glowTimer.current = window.setTimeout(() => setGlow(null), 1900);
  }, [editor]);
  const focus = useCallback((id?: string | null) => {
    if (!editor || !id) return; const s = editor.getShape(id as any); if (!s) return;
    editor.select(id as any); const b = editor.getShapePageBounds(id as any); if (b) editor.centerOnPoint(b.center, { animation: { duration: 260 } }); window.setTimeout(() => glowAt(id), 280);
  }, [editor, glowAt]);
  const focusMany = useCallback((ids: string[]) => { if (!editor) return; const live = ids.filter((id) => editor.getShape(id as any)); if (!live.length) return; editor.select(...(live as any[])); editor.zoomToSelection({ animation: { duration: 320 } }); }, [editor]);

  useEffect(() => {
    if (!editor) return;
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
    const close = startAgentBridge(boardId, editor, {
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
  }, [boardId, editor, glowAt]);

  /* Follow transcript growth (including TypedText and live media cards), not the board's Follow agent camera toggle.
     Immediate scrolling avoids smooth-scroll events mistaking an in-flight animation for a reader scrolling away. */
  useEffect(() => {
    const el = feedBox.current; const transcript = el?.firstElementChild; if (!el || !transcript) return;
    const follow = () => { if (stick.current) el.scrollTop = el.scrollHeight; };
    const observer = new ResizeObserver(follow); observer.observe(transcript); observer.observe(el); follow();
    return () => observer.disconnect();
  }, []);
  useEffect(() => { const el = feedBox.current; if (el && stick.current) el.scrollTop = el.scrollHeight; }, [feed.length, proposals]);

  const send = async (raw: string, starter?: StarterId, confirmId?: string) => {
    const body = raw.trim(); if (!body || sending) return; setSending(true); stick.current = true;
    const base = `/api/canvas/boards/${encodeURIComponent(boardId)}/agent`;
    try {
      /* while the demo waits for your OK, what you type is the answer (an edit, or Looks good) */
      /* your connected agent gets what you selected as context (card ids, names, workflow, status) */
      const selection = agentConnected && editor ? editor.getSelectedShapeIds().slice(0, 50).map((id) => { const s: any = editor.getShape(id); return { id, name: cardNameOf(editor, id) ?? null, type: s?.type ?? null, workflow: s?.props?.flow ?? null, status: s?.props?.status ?? null }; }) : [];
      const r = dockRoute({ connected: agentConnected, demoRunning: demoRef.current.running, confirmWaiting: !!confirmRef.current }) === 'messages'
        ? await fetch(`${base}/messages`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: body, ...(confirmId ? { confirm_id: confirmId } : {}), ...(selection.length ? { selection } : {}) }) })
        : await fetch(`${base}/demo`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: body, ...(starter ? { starter } : {}) }) });
      const b = await r.json().catch(() => ({})); if (!r.ok) throw new Error(b?.error || 'Could not send that.');
      if (b?.message) setFeed((prev) => mergeFeed(prev, [b.message]));
      /* a demo starting turns Follow agent on, so the camera shows what it builds */
      if (b?.runId) { setFollow(true); setDemo({ running: true, runId: b.runId, title: b.plan?.title ?? null }); }
      setText('');
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
  useEffect(() => { if (!editor || demo.running) return; const t = window.setTimeout(() => handOf(editor).leave(), 2600); return () => window.clearTimeout(t); }, [editor, demo.running]);
  useEffect(() => () => { if (editor) handOf(editor).leave(); }, [editor]); /* the dock closes (board switch): the hand goes with it */
  /* pick one: the choices pulse on the board until one is chosen; a click on one of them (it becomes the only selection) is the choice */
  const choose = useCallback(async (cardId: string) => {
    const pk = pickRef.current; if (!pk || pk.status !== 'waiting' || !pk.cardIds.includes(cardId) || choosing.current) return; choosing.current = true;
    try {
      const r = await fetch(`/api/canvas/boards/${encodeURIComponent(boardId)}/agent/pick`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pick_id: pk.id, card_id: cardId, ...(editor ? { title: cardNameOf(editor, cardId as any) ?? undefined } : {}) }) });
      const b = await r.json().catch(() => ({})); if (!r.ok) throw new Error(b?.error || 'Could not save your pick.');
      if (b?.pick) setPick(b.pick);
    } catch (e) { toast((e as Error).message, 'error'); } finally { choosing.current = false; }
  }, [boardId, editor, toast]);
  const pickRef = useRef(pick); pickRef.current = pick; const choosing = useRef(false);
  useEffect(() => {
    if (!editor) return;
    if (pick?.status === 'waiting') { fx.pick(pick.cardIds); handOf(editor).say('Waiting for your pick', true); }
    else { fx.pick([]); if (pick?.status === 'picked' && pick.chosen) fx.chosen(pick.chosen); }
    if (pick?.status !== 'waiting') return;
    const off = editor.store.listen(() => { const sel = editor.getSelectedShapeIds(); if (sel.length === 1 && pick.cardIds.includes(sel[0])) void choose(sel[0]); }, { scope: 'session' });
    return () => { off(); };
  }, [editor, pick, choose]);
  useEffect(() => () => fx.pick([]), []);

  const stop = async () => {
    if (editor) handOf(editor).leave(); /* the hand goes at once, not after the demo's last step */
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
  const pickStarter = (id: StarterId) => { const s = STARTERS.find((x) => x.id === id); if (s) void send(s.prompt, id); };

  const byId = useMemo(() => new Map(proposals.map((p) => [p.id, p])), [proposals]);
  const plan = useMemo(() => planOf(feed), [feed]);
  const confirm = useMemo(() => (demo.running ? confirmOf(feed) : null), [feed, demo.running]); confirmRef.current = confirm;
  const shown = feed.filter((e) => e.type !== 'proposal');
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
  const locked = demo.running && !agentConnected && !confirm; /* the box opens while the agent waits for your OK */
  const empty = shown.length === 0;

  return <>
    <aside className={`ap${open ? ' on' : ''}`} data-testid="agent-panel" aria-hidden={!open} aria-label="AI agent">
      <header className="ap-head">
        <div className="ap-brand"><span className="ap-mark"><SparkleIcon size={16} /></span><div><b>Agent</b><small data-testid="agent-mode" title={sessions.length > 1 ? sessionNames : connectedLine}>{connectedLine}</small></div></div>
        <div className="ap-head-r">
          <span className={`ap-status${agentListening ? ' on' : agentWorking ? ' on work' : agentConnected ? ' idle' : ' demo'}`} data-testid="agent-status" data-state={state === 'off' ? 'demo' : state} {...tip(agentListening ? `${agentLabel} reads what you type here` : agentWorking ? `${agentLabel} is building on this board. What you type waits until it listens` : agentConnected ? `${sessionNames || agentLabel}: connected, not reading this board yet. What you type waits here` : 'Starters play the built-in demo. Connect your own AI for a real one')}><i />{dockPill(state)}</span>
          <button type="button" className="ap-icon" aria-label="Connect your own AI" {...tip('Connect your own AI (MCP)')} onClick={() => setSheet(true)} data-testid="agent-connect"><ApiPlugIcon size={16} /></button>
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
            <h2>What should we make?</h2>
            {agentConnected ? <p data-testid="agent-hello-connected">{agentListening ? `${agentLabel} is listening.` : `${agentLabel} is connected.`} Tell it what to make; select cards first to point at them. Every paid step waits for your OK.</p>
              : <><p>Describe it, or pick a starter. The board on the right builds as the agent works, and every paid step waits for your OK.</p>
                <Starters onPick={pickStarter} disabled={sending || demo.running} />
                <button type="button" className="ap-connect" data-testid="agent-connect-offer" onClick={() => setSheet(true)}><ApiPlugIcon size={15} /><span><b>Connect your agent</b><small>Claude Code, Claude Desktop or any MCP client becomes the brain here</small></span></button></>}
          </div> : shown.map((e) => {
            if (e.type === 'message') {
              if (Array.isArray(e.meta?.plan)) return <div key={e.id} className="ap-group"><Message e={e} who={who} live={fresh.current.has(e.seq)} />
                <PlanCard title={String(e.meta.title ?? 'Plan')} steps={e.meta.plan} done={plan?.seq === e.seq ? plan.done : e.meta.plan.length} finished={plan?.seq === e.seq ? plan.finished : true} live={plan?.seq === e.seq && demo.running} /></div>;
              if (e.meta?.pick?.cardIds) return <div key={e.id} className="ap-group"><Message e={e} who={who} live={fresh.current.has(e.seq)} /><PickCard e={e} pick={pick} editor={editor} onPick={(id) => void choose(id)} onFocus={focus} /></div>;
              if (e.meta?.confirm?.id && confirm?.id === e.meta.confirm.id) return <div key={e.id} className="ap-group"><Message e={e} who={who} live={fresh.current.has(e.seq)} /><ConfirmCard label={confirm!.label} busy={sending} onOk={() => void send(confirm!.label, undefined, confirm!.id)} /></div>;
              return <Message key={e.id} e={e} who={who} live={fresh.current.has(e.seq)} status={statusOf(e)} />;
            }
            if (e.type === 'activity' && e.meta?.tool === 'add_card' && e.cardId) return <AgentMediaCard key={e.id} editor={editor} cardId={e.cardId} meta={{ ...e.meta, title: e.text.replace(/^Added “|”$/g, '') }} onFocus={focus} onReroll={(id, t) => void reroll(id, t)} rerolling={!!rerolling[e.cardId]} />;
            if (e.type === 'activity' && e.proposalId && /^Proposed/.test(e.text)) { const p = byId.get(e.proposalId);
              return p ? <ProposalCard key={e.id} p={p} busy={busy[p.id]} onDecide={(d) => void decide(p, d)} onFocus={focusMany} /> : <EventRow key={e.id} e={e} onFocus={focus} />; }
            return <EventRow key={e.id} e={e} onFocus={focus} />;
          })}
          {thinking && <div className="ap-typing" data-testid="agent-working" aria-live="polite"><i /><i /><i /><span>{agentPlanning && !hand.working ? `${agentStatus!.name} is planning…` : hand.working && hand.label ? `${hand.label}…` : runningN ? `Waiting for ${runningN === 1 ? 'the result' : `${runningN} results`}…` : 'Thinking…'}</span></div>}
          {pickWaiting && <div className="ap-typing wait" data-testid="agent-waiting-pick" aria-live="polite"><span>Waiting for your pick</span></div>}
          {!connection && <p className="ap-conn-note">The canvas connection dropped. Reconnecting…</p>}
          </div>
        </div>
        <form className="ap-compose" onSubmit={(ev) => { ev.preventDefault(); void send(text); }}>
          {state === 'connected' && <ListenHint boardId={boardId} name={agentLabel} onSetup={() => setSheet(true)} />}
          {state === 'working' && <p className="ap-working" data-testid="agent-working-note" aria-live="polite"><i aria-hidden /><span><b>{workingLine(agentLabel)}.</b> What you type waits until it listens.</span></p>}
          {!empty && !demo.running && !agentConnected && <div className="ap-chips" aria-label="Starters">{STARTERS.map((s) => <button key={s.id} type="button" className="ap-chip" disabled={sending} onClick={() => pickStarter(s.id)} data-testid={`agent-chip-${s.id}`}>{s.label}</button>)}</div>}
          <div className="ap-box">
            <textarea ref={ta} value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={4000} disabled={locked}
              placeholder={confirm ? 'What should change? Or press Looks good.' : locked ? 'The agent is working. Stop it to start something new.' : agentConnected ? `Message ${agent.agentName || 'your AI'}…` : 'Describe a film, an ad, a picture to animate…'} aria-label="Message the agent" data-testid="agent-reply"
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(text); } }} />
            {demo.running && !agentConnected && !(confirm && text.trim())
              ? <button type="button" className="ap-send stop" onClick={() => void stop()} aria-label="Stop the agent" {...tip('Stop. Cards already on the board stay')} data-testid="agent-stop"><StopIcon size={15} /></button>
              : <button type="submit" className="ap-send" disabled={!text.trim() || sending} aria-label="Send" data-testid="agent-send"><SendIcon size={16} /></button>}
          </div>
          <p className="ap-hint">{agentListening ? `Goes straight to ${agentLabel}. Canvas proposals wait for your Go.` : agentConnected ? `Waits here until ${agentLabel} reads it. Canvas proposals wait for your Go.` : 'Builds drafts on this board. Canvas proposals wait for your Go.'}</p>
        </form>
      </div>
      {sheet && <ConnectSheet config={config} mcpUrl={mcpUrl} onClose={() => setSheet(false)} boardId={boardId} />}
    </aside>
    {glow && createPortal(<div className="ap-glow" key={glow.key} style={{ left: glow.left, top: glow.top, width: glow.width, height: glow.height }} aria-hidden />, document.body)}
  </>;
}
