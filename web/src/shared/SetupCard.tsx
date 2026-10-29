/**
 * Setup lives on the Generate button (2026-10-23, replaces the 5b-2 setup card above the bar). When the chosen model can't run anywhere yet
 * (the quote says runnable:false and names places to set up), Generate becomes the next step: its label says it ("Download 53 GB",
 * "Add Comfy key", "Turn on Local") and a click opens a small popover on the button with every place in the agreed order
 * (Comfy → other API → Local), each with its price and its one action, plus "Use another place" (the Run on menu).
 * Nothing is pre-chosen: a download starts only from the user's click in the popover, a key goes to the Settings card.
 * Two quiet one-line states can sit under a bar (SetupStatus): the files are downloading for a run, or a download was chosen (with undo).
 * Create Image shows them on the things they are about instead (2026-10-23): a ring on the model chip, Generate's second line, and the
 * undo in the model menu (DownloadIntentRow).
 */
import { Notice } from './Notice';
import { hasFreeLocal } from './KeyNeeded';
import { useRef, useState } from 'react';
import { listPrice, runOnLabel, setRunOn, setupPlacesOf, shownName, type SetupPlace, type ToolModel } from './models';
import { setDownloadIntent, useDownloadIntent } from './hardware';
import { gbText } from './fit';
import { useBilling, modeOf } from './billing';
import { Popover } from './Popover';
import { keyWord } from './ModelHoverCard';
import { placeActionGo, RunOnMenu } from '../ui/routing/RunOn';
import { placeIconFor, ChevronRightIcon } from '../ui/Icons';
import './setupCard.css';
import { LOCAL_LABEL } from '../../../server/src/shared/modelIds';
import { ConnectGenerate, useSetupKind } from './ConnectSheet';

/** The short reason a disabled Generate shows (older callers); the setup button itself now says the next step. */
export const SETUP_FIRST = 'Set up a place to run first';
/** Generate when the chosen model has no place to run (Image, Video, Audio share it): with nothing connected at all it opens the connect
 *  sheet; otherwise it stays disabled and says to set up a place. */
export function NoPlaceGenerate({ testId, priceTestId }: { testId: string; priceTestId: string }) {
  const sk = useSetupKind(); if (sk === 'none') return <ConnectGenerate testId={testId} priceTestId={priceTestId} />;
  return <button type="button" className="ic-gen gen-btn gen-dock btn btn-primary ic-gen-nosetup" data-testid={testId} data-needs-setup="1" disabled title={SETUP_FIRST}><span className="gen-l">Generate</span><span className="gen-price gen-setup-why" data-testid={priceTestId}>{SETUP_FIRST}</span></button>;
}

/** True when the chosen model needs a place set up (Generate becomes the setup button). A download the user already said yes to
 *  (the next run fetches the files first) isn't a blocker: Generate runs it. */
export function setupNeeded(m: ToolModel | undefined, q: any, engine?: string | null, intent?: unknown): boolean {
  if (!q || q.runnable !== false) return false; if (q.setup?.action === 'download' && intent && engine) return false;
  return setupPlacesOf(m, q).length > 0;
}

const sizeOf = (p: SetupPlace) => (p.action.missingBytes ? gbText(p.action.missingBytes) : String(p.action.text ?? '').replace(/^Download\s*/i, '').trim());
/** The step a place needs, as a button label ("Download 53 GB", "Add Comfy key", "Turn on Local"). */
export function stepText(p: SetupPlace): string {
  const a = p.action;
  if (a.kind === 'download') { const s = sizeOf(p); return s ? `Download ${s}` : 'Download'; }
  if (a.connection === 'deploy') return a.text || 'Set up your deployment'; // H3 CrossView: the deployment is missing, not the key
  if (a.kind === 'add_key') return `Add ${keyWord(p.runOn, p.label)} key`;
  if (a.kind === 'turn_on') return `Turn on ${LOCAL_LABEL}`;
  if (a.kind === 'install_node') return 'Install node';
  return a.text || 'Set up';
}
function needLine(p: SetupPlace): string {
  const a = p.action;
  if (a.connection === 'deploy') return 'one-time setup in your Comfy account';
  if (a.kind === 'add_key') return 'needs a key';
  if (a.kind === 'download') return `one-time download${p.slow ? ', may be slow here' : ''}`;
  if (a.kind === 'turn_on') return 'turn on in Settings';
  if (a.kind === 'install_node') return 'needs a custom node';
  return a.text;
}
/** The place Generate leads with: the chosen place when it is one to set up, else the first in the agreed order. */
const leadOf = (places: SetupPlace[], q: any) => places.find(p => p.runOn === q?.runOn) ?? places[0];

/** One place's setup step, from the user's click (the setup popover, or a pre-flight fix): a download is the user's own yes (the next run on
 *  Local fetches the files first and Local becomes the choice); a key / turn on / node goes where that is done. */
export async function doSetupPlace(toolId: string, model: ToolModel | undefined, engine: string | null | undefined, p: SetupPlace) {
  if (p.action.kind === 'download') {
    const eng = model?.runsOn.find(r => r.id === 'local')?.engines[0] ?? engine ?? ''; if (eng) setDownloadIntent(eng, { variantId: null, bytes: p.action.missingBytes ?? null });
    if (model) await setRunOn(toolId, model.key, 'local');
  } else await placeActionGo({ action: p.action.kind, runOn: p.runOn, missingBytes: p.action.missingBytes ?? null, connection: p.action.connection }, engine);
}
/** Generate as the next setup step, with the setup popover. Render it instead of Generate while setupNeeded() is true. */
export function SetupGenerate({ toolId, model, engine, quote, className = 'btn btn-primary gen-btn', testId = 'setup-generate', priceTestId }: { toolId: string; model: ToolModel | undefined; engine?: string | null; quote: any;
  /** the page's Generate classes, so the button keeps its place and size */ className?: string; testId?: string; priceTestId?: string }) {
  const own = modeOf(useBilling(), quote) !== 'team'; const btn = useRef<HTMLButtonElement>(null); const more = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false); const [roOpen, setRoOpen] = useState(false); const [busy, setBusy] = useState(''); const [err, setErr] = useState('');
  const sk = useSetupKind(); if (sk === 'none') return <ConnectGenerate testId={testId} priceTestId={priceTestId} className={className} />; // nothing connected: one sheet, two paths
  const places = setupPlacesOf(model, quote); const lead = leadOf(places, quote); if (!lead) return null;
  const name = model ? shownName(model) : 'This model';
  const priceOf = (p: SetupPlace) => (p.runOn === 'local' ? 'Free per run' : (() => { const x = listPrice(p.credits, p.runOn, own); return x ? `${x} per run` : ''; })());
  const go = async (p: SetupPlace) => { if (busy) return; setBusy(p.runOn); setErr('');
    try { await doSetupPlace(toolId, model, engine, p); setOpen(false); } catch (e) { setErr((e as Error).message); } finally { setBusy(''); } };
  const sub = [lead.runOn === 'local' ? `${LOCAL_LABEL} · free` : `${runOnLabel(lead.runOn) || lead.label}`, places.length > 1 ? `${places.length - 1} more way${places.length > 2 ? 's' : ''}` : ''].filter(Boolean).join(' · ');
  return <>
    <button ref={btn} type="button" className={`${className} gen-setup`} data-testid={testId} data-needs-setup="1" data-step={lead.action.kind} data-run-on={lead.runOn} aria-haspopup="dialog" aria-expanded={open}
      title={`${name} needs ${runOnLabel(lead.runOn) || lead.label} set up first`} onClick={() => setOpen(o => !o)}>
      <span className="gen-l">{stepText(lead)}<ChevronRightIcon size={14} className="gen-setup-chev" /></span>
      <span className="gen-price gen-setup-sub" data-testid={priceTestId}>{sub}</span>
    </button>
    <Popover open={open} anchor={btn} placement="top" align="end" onClose={() => { setOpen(false); setRoOpen(false); }} label={`Set up ${name}`} className="setup-pop" testId="setup-pop" width={384}>
      <div className="setup-card" data-testid="setup-card" data-state="pick">
        <p className="setup-h"><span><b>{name}</b> {places.length === 1 ? `runs once ${runOnLabel(places[0].runOn) || places[0].label} is set up.` : 'isn’t set up yet. Pick where it runs:'}</span></p>
        <ul className="setup-list">{places.map(p => { const Icon = placeIconFor(p.runOn);
          return <li key={p.runOn} className="setup-row" data-testid={`setup-opt-${p.runOn}`} data-action={p.action.kind}>
            <Icon size={16} className="setup-ic" />
            <span className="setup-t"><b>{p.label}</b><small>{[priceOf(p), needLine(p)].filter(Boolean).join(' · ')}</small></span>
            <button type="button" className="btn btn-sm setup-go" data-apop-item data-testid={`setup-go-${p.runOn}`} disabled={!!busy} aria-busy={busy === p.runOn} onClick={() => void go(p)}>{busy === p.runOn ? 'One moment…' : stepText(p)}</button>
          </li>; })}</ul>
        {err && <Notice as="p" kind="error" tone="line" className="setup-err">{err}</Notice>}
        {/* cloud first (2026-10-27): a first install has no key yet; when this tool has a free model on your computer, name that way too */}
        {places.every(p => p.action.kind === 'add_key') && hasFreeLocal(toolId) && <p className="setup-free" data-testid="setup-free-local">No key yet? Pick a free model that runs on your computer from the model menu.</p>}
        {model && <><button ref={more} type="button" className="setup-more" data-testid="setup-other-place" aria-expanded={roOpen} onClick={() => setRoOpen(o => !o)}>Use another place<ChevronRightIcon size={14} /></button>
          <RunOnMenu open={roOpen} anchor={more} placement="top" onClose={() => setRoOpen(false)} toolId={toolId} model={model} engine={engine} quote={quote} /></>}
      </div>
    </Popover>
  </>;
}

/** The size a chosen download fetches ("12 GB"), or null when no download was chosen for this model. */
export function intentSize(quote: any, intent: { bytes: number | null } | null | undefined, engine?: string | null): string | null {
  if (!(quote?.setup?.action === 'download' && intent && engine)) return null; const b = Number(intent.bytes || quote.setup.missingBytes) || 0;
  return String(quote.setup.actionText ?? '').replace(/^Download\s*/, '').trim() || (b ? gbText(b) : 'the model files');
}
/** Create bar (2026-10-23): a chosen download, as one row in the model menu with its undo (Generate's second line says "Free · downloads 12 GB first"). */
export function DownloadIntentRow({ engine, quote }: { engine?: string | null; quote: any }) {
  const intent = useDownloadIntent(engine ?? null); const size = intentSize(quote, intent, engine); if (!size || !engine) return null;
  return <p className="setup-intent-row" data-testid="setup-intent-row" role="status"><span>Your next run downloads {size} to Local first. The download is free.</span>
    <button type="button" className="link-btn setup-undo" data-testid="setup-undo" onClick={() => setDownloadIntent(engine, null)}>Don’t download</button></p>;
}

/** The two quiet states under a bar: a run is downloading this model's files, or the user chose to download (with undo). null otherwise.
 *  Create Image no longer uses it (2026-10-23: the ring on the model chip, Generate's second line and DownloadIntentRow in the model menu). */
export function SetupStatus({ model, engine, quote, downloading = false, className = '' }: { model: ToolModel | undefined; engine?: string | null; quote: any; downloading?: boolean; className?: string }) {
  const intent = useDownloadIntent(engine ?? null); const name = model ? shownName(model) : 'This model';
  if (downloading) return <p className={`setup-status ${className}`.trim()} data-testid="setup-status" data-state="downloading" role="status">Downloading {name}’s files for your run. Generate unlocks when it’s done.</p>;
  if (quote?.setup?.action === 'download' && intent && engine) { const b = Number(intent.bytes || quote.setup.missingBytes) || 0; const size = String(quote.setup.actionText ?? '').replace(/^Download\s*/, '') || (b ? gbText(b) : 'the model files');
    return <p className={`setup-status ${className}`.trim()} data-testid="setup-status" data-state="download-chosen" role="status">
      <span>Generate downloads {size} to Local first. The download is free.</span>
      <button type="button" className="link-btn setup-undo" data-testid="setup-undo" onClick={() => setDownloadIntent(engine, null)}>Don’t download</button></p>; }
  return null;
}
