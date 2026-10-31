/**
 * Settings → Connections (MODEL-ROUTE-SPEC §2.4): the accounts models run on, in three sections — Local, Comfy Cloud (one key), Direct
 * providers (optional). Settings → Routing (RoutingPrefs below): fallback, your choices per tool, run setup again. Keys use the existing
 * mechanism (POST /api/settings/providers, DELETE /api/settings/providers/:id), saved only when the server runs on this computer
 * (HOST=127.0.0.1). A saved key is never shown: only "•••• set". When the server can't store keys, every card says so in place (a visible,
 * disabled Add key with the reason) and one banner explains the two ways to turn it on (PAGES-ROUND2 C1).
 */
import { SampleModeNote, useBackend } from '../../shared/SampleMode';
import { Notice } from '../../shared/Notice';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from '../../platform/router';
import { InlineError, TechDetails } from '../../shared/InlineError';
import { useQueueLimits, concurrencyLine } from '../edge/Edge';
import { Skeleton } from '../../shared/Skeleton';
import { Popover } from '../../shared/Popover';
import { MakerTile } from '../../shared/MakerTile';
import { plainCopy } from '../../shared/plainCopy';
import { onReconnect } from '../../shared/connectivity';
import { useOpenWeightsOnly } from '../../shared/OpenWeights';
import { OpenModelsSwitch } from './OpenModelsSwitch';
import { useBilling, useAccounts, refreshAccounts, saveBilling, fmtUsd, ago, balanceText, balanceDetail, comfyPlanNow, type Account, type ProviderBilling, type FailureRule } from '../../shared/billing';
import { requestRequote } from '../../shared/quote';
import { refreshTools } from '../../shared/useTools';
import { useRouting, setRouting, loadRouting, resetRunOns, toolLike, routingNow, type ToolModel } from '../../shared/models';
import { listTools } from '../../api';
import { askConfirm } from '../../shared/Dialog';
import { openRunSetup } from '../setup/RunSetup';
import { repoDoc } from '../../shared/brand';
import { LOCAL_LABEL } from '../../../../server/src/shared/modelIds';
import { runChoice } from '../../shared/runChoices';
import { planRateText, type ComfyPlanId } from '../../../../server/src/shared/priceText';
import { countLocalModels, localCountsText, machineLabel, type LocalCounts } from '../../../../server/src/shared/thisComputer';
import { useHardware } from '../../shared/hardware';

type Prov = { id: string; name: string; envKey?: string; configured: boolean; mockedKey?: boolean; keysUrl?: string; docsUrl?: string; keySetAt?: string | null; keySource?: 'saved' | 'env' | 'mock' | null; keyEnvVar?: string | null; keyFormat?: 'ok' | 'unexpected' | 'unchecked' | null; disabledReason?: string | null };
type ProvList = { providers: Prov[]; canStoreKeys: boolean; storeKeysNote?: string };
/** Card names (the settings list names some providers by their API; Connections uses the account name). */
const NAME: Record<string, string> = { local: LOCAL_LABEL, comfy: 'Comfy Cloud', fal: 'fal', replicate: 'Replicate', bfl: 'Black Forest Labs', minimax: 'MiniMax', ltx: 'LTX', openai: 'OpenAI', google: 'Google Gemini API', byteplus: 'BytePlus ModelArk', dashscope: 'Alibaba Cloud', luma: 'Luma AI', hf: 'Hugging Face' };
/** Billing id → run-on id (the models' runsOn rows). */
const RUN_ON_OF: Record<string, string> = { local: 'local', comfy: 'comfy-cloud', fal: 'fal', replicate: 'replicate', bfl: 'bfl', minimax: 'minimax', ltx: 'ltx', openai: 'openai', google: 'google', byteplus: 'byteplus', dashscope: 'dashscope', luma: 'luma' };
/** Providers that are also model makers reuse the maker tile (web/src/shared/makers.ts); the rest get the tile's neutral glyph. */
const MAKER_OF: Record<string, string> = { bfl: 'bfl', minimax: 'minimax', ltx: 'lightricks', openai: 'openai', google: 'google', byteplus: 'bytedance', luma: 'luma', comfy: 'comfy', fal: 'fal', dashscope: 'alibaba-qwen' };
const MAIN_DIRECT = ['fal', 'replicate', 'openai', 'google', 'byteplus', 'bfl', 'minimax', 'ltx']; const MORE_DIRECT = ['dashscope', 'luma'];
/** C7: one chip for the failed-run rule; the provider's own sentence is the tooltip. */
const RULE_CHIP: Record<FailureRule, [string, 'ok' | 'warn' | 'calm']> = { 'not-charged': ['Failed runs: not charged', 'ok'], 'may-charge': ['Failed runs: may be charged', 'warn'], unknown: ['Failed runs: not published', 'calm'] };

/** Distinct models (across every tool) that can run on a run-on, with their names. */
function unlocks(tools: { models?: ToolModel[] }[], runOn: string): { n: number; names: string[] } {
  const seen = new Map<string, string>();
  for (const t of tools) for (const m of t.models ?? []) if (m.runsOn.some(r => r.id === runOn && r.status !== 'coming-soon' && r.status !== 'unavailable')) seen.set(m.key, m.displayName || m.name);
  return { n: seen.size, names: [...seen.values()].sort((a, b) => a.localeCompare(b)) };
}
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
const dateOf = (iso?: string | null) => { if (!iso) return ''; const d = new Date(iso); return Number.isFinite(d.getTime()) ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''; };
const jumpTo = (id: string) => (e: React.MouseEvent) => { e.preventDefault(); const el = document.getElementById(id); el?.scrollIntoView({ behavior: 'smooth', block: 'start' }); el?.focus({ preventScroll: true }); };

/** PUT /api/me/routing {global: patch} with a short Saving… / Saved line. Shared by Connections (Use my GPU) and Routing (fallback). */
function usePutGlobal() {
  const [saved, setSaved] = useState('');
  const put = async (patch: Record<string, unknown>) => { setSaved('Saving…'); try { const r = await fetch('/api/me/routing', { method: 'PUT', headers: { 'content-type': 'application/json', 'x-openhiggsfield-source': 'web connections' }, body: JSON.stringify({ global: patch }) });
    const b = await r.json().catch(() => null); if (!r.ok) throw new Error(String(b?.error ?? `HTTP ${r.status}`)); setRouting(b); setSaved('Saved'); refreshTools(); requestRequote(); } catch (e) { setSaved(`Couldn’t save: ${(e as Error).message}`); } setTimeout(() => setSaved(''), 2200); };
  return [saved, put] as const;
}

export function Connections() {
  const [d, setD] = useState<ProvList | null>(null); const [err, setErr] = useState(''); const [tick, setTick] = useState(0);
  const [tools, setTools] = useState<{ id: string; name: string; models?: ToolModel[] }[]>([]);
  const [local, setLocal] = useState<{ reachable?: boolean; enabled?: boolean; statusText?: string } | null>(null);
  const backend = useBackend(); const sample = backend === 'mock';
  const rt = useRouting(); const bill = useBilling(); const accts = useAccounts(); const owOnly = useOpenWeightsOnly(); const lim = useQueueLimits();
  const [saved, putGlobal] = usePutGlobal(); const [modeMsg, setModeMsg] = useState(''); const [moreOpen, setMoreOpen] = useState(false);
  useEffect(() => onReconnect(() => setTick(n => n + 1)), []);
  useEffect(() => { setErr('');
    fetch('/api/settings/providers', { signal: AbortSignal.timeout(12000) }).then(r => r.ok ? r.json() : Promise.reject(Object.assign(new Error(`HTTP ${r.status}`), { status: r.status }))).then(setD).catch(e => setErr(e?.name === 'TimeoutError' ? 'timed out' : (e.message || 'error')));
    fetch('/api/config').then(r => r.ok ? r.json() : null).then(c => c && setLocal(c.local && typeof c.local === 'object' ? c.local : { reachable: !!c.localAvailable })).catch(() => 0);
    listTools().then(t => setTools(t as any)).catch(() => 0); void loadRouting(true); }, [tick]);
  /* #providers (old links), #connections, #conn-<id> (Run-on "Add key ›"), #use-local, #open-models: scroll there once the cards are in */
  useEffect(() => { if (!d) return; const h = location.hash.slice(1); if (!h || h === 'connections' || h === 'providers') return; setTimeout(() => {
    const id = h === 'providers' ? 'connections' : h === 'use-local' ? 'conn-local' : h; const el = document.getElementById(id); if (!el) return; el.scrollIntoView({ block: 'start' });
    if (h === 'use-local') document.querySelector<HTMLElement>('[data-testid=use-local-switch]')?.focus({ preventScroll: true });
    else if (h.startsWith('conn-')) el.querySelector<HTMLElement>('[data-testid^=conn-add-]')?.focus({ preventScroll: true }); }, 60); }, [!!d]);
  const after = () => { setTick(n => n + 1); refreshTools(); void refreshAccounts(); requestRequote(); };
  const prov = (id: string) => d?.providers.find(p => p.id === id); const acct = (id: string) => accts?.accounts.find(a => a.provider === id); const info = (id: string) => bill?.providers.find(p => p.id === id);
  const gpu = unlocks(tools, 'local'); const comfyU = unlocks(tools, 'comfy-cloud');
  const fits = useMemo(() => countLocalModels(tools), [tools]);
  const connected = (d?.providers ?? []).filter(p => p.id !== 'local' && p.configured && !p.mockedKey);
  const useLocal = rt ? !!rt.global?.useLocal : !!local?.enabled; const reach = local?.reachable;
  const toggleLocal = () => void putGlobal({ useLocal: !useLocal });
  // Other providers (2026-10-27): a direct account whose models all run on Comfy (or here) is hidden unless Show other providers is on (Settings → Routing);
  // a saved key keeps its card (and keeps working). The server hides the same places from the model menus (server routing/hiddenPlaces.ts).
  const showOther = !!rt?.global?.showOtherProviders; const needed = (id: string) => showOther || unlocks(tools, RUN_ON_OF[id]).n > 0 || (!!prov(id)?.configured && !prov(id)?.mockedKey);
  const hiddenDirect = tools.length ? [...MAIN_DIRECT, ...MORE_DIRECT].filter(id => prov(id) && !needed(id)) : [];
  const card = (id: string) => <KeyCard key={id} p={prov(id)} info={info(id)} acct={acct(id)} canStore={!!d?.canStoreKeys} unlock={unlocks(tools, RUN_ON_OF[id])} onDone={after} hostedOff={owOnly} />;
  return <section className="prov-settings conn set-sec" id="connections" data-testid="providers-settings" aria-labelledby="conn-h" aria-busy={!d || !rt}>
    <span id="providers" className="conn-anchor" aria-hidden />
    <h2 id="conn-h">Connections</h2>
    <p className="conn-lede">Choose where your models run and who bills you. You always see the price first.</p>
    {d && <p className="prov-sum" data-testid="prov-summary">{connected.length ? <><b>{connected.length} connected</b>: {connected.map(p => NAME[p.id] ?? p.name).join(', ')}.</> : <><b>Nothing connected yet.</b> {sample ? 'For now every run is a free sample.' : 'Until you add a key or set up your computer, you’ll get free samples.'}</>}</p>}
    {d && sample && (connected.length > 0 || useLocal) && <SampleModeNote />}
    <TechDetails summary="Details" className="conn-details" testId="conn-limits-details"><p className="helper conn-limits" data-testid="conn-limits"><b>Queue:</b> {concurrencyLine(lim)} The same on every connection.</p></TechDetails>
    {err && !d && <InlineError what="connections" error={/^HTTP 5/.test(err) ? Object.assign(new Error(err), { status: 500 }) : new Error(err)} onRetry={() => setTick(n => n + 1)} />}
    {!d && !err && <Skeleton variant="rows" count={5} label="Loading connections" />}

    {d && <>
      {/* ---- Local ---- */}
      <div className="conn-sec" id="conn-local"><SecHead id="gpu" />
        <div className={`conn-card${reach && useLocal ? ' is-on' : ''}`} data-testid="conn-card-local">
          <div className="conn-t"><ProvMark id="local" />Your computer <StatusPill tone={reach ? (useLocal ? 'ok' : 'calm') : 'off'} testId="prov-st-local">{sample ? 'Sample mode' : reach ? (useLocal ? 'In use' : 'Found, not in use') : local ? 'Not found' : 'Checking…'}</StatusPill></div>
          <div className="conn-acts">
            {reach === false && <Link to="/settings#gpu" className="btn btn-sm btn-primary" data-testid="conn-gpu-setup">Set up GPU</Link>}
            {rt && <span className="conn-sw" data-testid="use-local-toggle"><button type="button" role="switch" aria-checked={useLocal} aria-label="Use my GPU when possible" aria-describedby="use-local-help" data-testid="use-local-switch" className={`toggle-ui-btn prov-sw ${useLocal ? 'on' : ''}`} disabled={reach === false && !useLocal} onClick={toggleLocal}><i /></button></span>}
          </div>
          <div className="conn-facts"><Unlocks u={gpu} where="Your computer" /><span>Free · nothing billed</span><HwLine fits={fits} /></div>
          <p className="helper conn-help" id="use-local-help" data-testid="local-available">{sample ? 'Sample mode: runs here make free samples, not ComfyUI renders. Test your ComfyUI address below.'
            : reach === false ? 'ComfyUI isn’t reachable from the server yet. Set it up, or test another address below.'
            : useLocal ? 'On: open models run here first, for free. A model you set to run somewhere else keeps that choice.'
            : 'ComfyUI is running, but models go to other places. Turn it on to run them here for free.'}{saved && <span role="status"> {saved}</span>}</p>
          {(sample || rt?.envUseLocal != null) && <TechDetails summary="Details" className="conn-help conn-details" testId="local-details">
            {sample && <p className="helper" data-testid="local-real-runs">Real runs start once the app runs with <code>OPENHIGGSFIELD_BACKEND=comfy</code>.</p>}
            {rt?.envUseLocal != null && <p className="helper" data-testid="use-local-env">Set by <code>OPENHIGGSFIELD_USE_LOCAL={rt.envUseLocal ? '1' : '0'}</code> in your env file each time the server starts. Changing it here lasts until the server restarts.</p>}
          </TechDetails>}
          <GpuTest />
        </div>
        {/* Setup step 3: a read token for gated model downloads (huggingface.co only) */}
        {prov('hf') && <KeyCard p={prov('hf')} canStore={d.canStoreKeys} unlock={{ n: 0, names: [] }} onDone={after}
          factsLine="Downloads gated models (such as FLUX.1 Fill dev) from Hugging Face. A read token is enough; it’s sent to huggingface.co only."
          note="Accept each gated model’s licence on its Hugging Face page first." />}</div>

      {!d.canStoreKeys && <KeysOffBanner example={prov('comfy')?.envKey ?? 'COMFY_API_KEY'} />}

      {/* ---- Comfy ---- */}
      <div className="conn-sec" id="conn-comfy"><SecHead id="comfy" />
        <KeyCard p={prov('comfy')} info={info('comfy')} acct={acct('comfy')} canStore={d.canStoreKeys} unlock={comfyU} onDone={after}
          note="Billed to your Comfy account. Prices here are in dollars; Comfy’s own credits show on hover." />
        <DeployCard />
        <CloudSetupCard /></div>

      {/* ---- Your plans (prices in dollars, 2026-10-26) ---- */}
      <div className="conn-sec" id="conn-plans"><div className="conn-sec-h" data-testid="conn-sec-h-plans"><h3>Your plans</h3><small>Only changes the price details, never the dollar prices.</small></div>
        <PlansCard /></div>

      {/* ---- Your own keys ---- */}
      <div className="conn-sec" id="conn-direct"><SecHead id="direct" />
        {MAIN_DIRECT.filter(id => !hiddenDirect.includes(id) || location.hash === `#conn-${id}`).map(id => prov(id) && card(id))}
        {MORE_DIRECT.some(id => !hiddenDirect.includes(id)) && <button type="button" className="link-btn conn-more" aria-expanded={moreOpen} data-testid="conn-more" onClick={() => setMoreOpen(o => !o)}>{moreOpen ? 'Fewer providers' : `More: ${MORE_DIRECT.filter(id => !hiddenDirect.includes(id)).map(id => NAME[id]).join(' · ')} ›`}</button>}
        {(moreOpen || MORE_DIRECT.some(id => prov(id)?.configured && !prov(id)?.mockedKey) || MORE_DIRECT.some(id => location.hash === `#conn-${id}`)) && MORE_DIRECT.filter(id => !hiddenDirect.includes(id) || location.hash === `#conn-${id}`).map(id => prov(id) && card(id))}
        {hiddenDirect.length > 0 && <p className="helper conn-hidden-note" data-testid="conn-hidden-note"><b>{hiddenDirect.length === 1 ? '1 more provider is' : `${hiddenDirect.length} more providers are`} hidden</b> ({hiddenDirect.map(id => NAME[id] ?? id).join(', ')}): Comfy already runs their models with your one key. <Link to="/settings#routing" className="conn-link" data-testid="conn-show-other">Show them in Routing</Link></p>}
      </div>

      {/* ---- Account-wide choices ---- */}
      <div className="conn-sec" id="conn-account"><div className="conn-sec-h"><h3>Models and billing</h3></div>
        <OpenModelsSwitch onChange={after} />
        {owOnly && <p className="helper prov-ow-note" data-testid="prov-ow-note">Hosted providers are switched off while open models only is on, so their keys aren’t needed.</p>}
        {bill && <div className="prov-billing" data-testid="billing-mode"><span className="helper">Who pays</span><div className="subtabs" role="radiogroup" aria-label="Who pays for hosted runs">{([['own-accounts', 'Your own accounts'], ['team', 'Team balance']] as const).map(([m, l]) => <button key={m} type="button" role="radio" aria-checked={bill.mode === m} className={bill.mode === m ? 'on' : ''} disabled={!bill.canWrite || bill.modeLocked} data-testid={`billing-mode-${m}`} onClick={() => { if (bill.mode === m) return; setModeMsg('Saving…'); saveBilling({ mode: m }).then(() => setModeMsg('Saved')).catch(e => setModeMsg(`Couldn’t save: ${(e as Error).message}`)).finally(() => setTimeout(() => setModeMsg(''), 2000)); }}>{l}</button>)}</div>
          <small className="helper">{bill.mode === 'team' ? 'Team mode: an operator pays the providers and gives people a balance in dollars.' : 'Each place bills your own account; prices show the estimated cost and where it’s billed.'}{bill.modeLocked ? ' Set by the server.' : !bill.canWrite ? ` ${bill.writeNote}` : ''}{modeMsg && ` ${modeMsg}`}</small></div>}
      </div>
    </>}
  </section>;
}

/** A section head with the same name, line and meta as the first-run card (shared/runChoices.ts). */
function SecHead({ id }: { id: 'gpu' | 'comfy' | 'direct' }) {
  const c = runChoice(id);
  return <div className="conn-sec-h" data-testid={`conn-sec-h-${id}`}><h3>{c.title}</h3><small>{c.line}{id !== 'gpu' ? ` ${c.meta}.` : ''}</small></div>;
}

/** C1: why there's no working Add key on this server, and the two ways to turn it on. */
function KeysOffBanner({ example }: { example: string }) {
  return <div className="conn-banner" id="conn-keys-off" tabIndex={-1} role="note" aria-labelledby="conn-keys-off-h" data-testid="prov-note">
    <i className="conn-banner-ic" aria-hidden><svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><rect x="4" y="9" width="12" height="8" rx="2" /><path d="M7 9V6.5a3 3 0 0 1 6 0V9" /></svg></i>
    <div><b id="conn-keys-off-h">Add keys on the computer that runs the app</b>
      <p>For safety, keys can only be added there. To add a key, either:</p>
      <ol>
        <li>Restart it on this computer only, with plain <code>npm run dev</code> (or <code>HOST=127.0.0.1</code>), then use Add key here.</li>
        <li>Or put the key in <code>.env.local</code> in the app folder (a line such as <code>{example}=…</code>) and restart.</li>
      </ol>
      <Link to={repoDoc('docs/INSTALL.md')} className="conn-link">Setup guide ↗</Link></div>
  </div>;
}

function StatusPill({ tone, children, testId, title }: { tone: 'ok' | 'calm' | 'warn' | 'off'; children: React.ReactNode; testId?: string; title?: string }) {
  return <span className={`conn-pill cp-${tone}`} data-testid={testId} title={title}>{tone === 'ok' && <i className="mp-st mp-st-ok" aria-hidden />}{tone === 'warn' && <i className="mp-st mp-st-demo" aria-hidden />}{children}</span>;
}
/** C10: a 24 px mark beside the account name. */
function ProvMark({ id }: { id: string }) {
  if (id === 'local') return <span className="mk-tile mk-mono mk-neutral conn-mark" aria-hidden><svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"><rect x="3" y="5" width="14" height="10" rx="2" /><path d="M7 15v2M13 15v2M6 8h4v4H6z" /></svg></span>;
  return <MakerTile maker={MAKER_OF[id] ?? null} fallback={MAKER_OF[id] ? null : (NAME[id] ?? id)} className="conn-mark" title={false} />;
}
/** C4: "Unlocks N models" + a "See which" popover with the full list (no truncated names in the line). */
function Unlocks({ u, where, empty }: { u: { n: number; names: string[] }; where: string; empty?: string }) {
  const [open, setOpen] = useState(false); const ref = useRef<HTMLButtonElement>(null);
  if (!u.n) return <span>{empty ?? 'Nothing runs here on this server yet'}</span>;
  return <span className="conn-unl">Unlocks <b>{plural(u.n, 'model')}</b>{u.names.length > 0 && <>{' · '}<button ref={ref} type="button" className="link-btn conn-link" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen(o => !o)}>See which</button>
    <Popover open={open} anchor={ref} onClose={() => setOpen(false)} label={`Models on ${where}`} placement="bottom" closeButton width={300} className="conn-unl-pop">
      <ul className="conn-unl-list">{u.names.map(n => <li key={n}>{n}</li>)}</ul></Popover></>}</span>;
}
/** The machine by its own name, and how many unique local models run on it (shared/thisComputer.ts, the same words as Settings → Your computer). */
function HwLine({ fits }: { fits: LocalCounts }) {
  const hw = useHardware();
  if (!hw) return null; const unknown = !hw.tier || hw.tier === 'unknown'; const name = machineLabel(hw.profile);
  return <span data-testid="conn-hw" title={hw.tierLabel}>{unknown ? 'Hardware not checked yet, so nothing is blocked' : <>{name ? `${name} · ` : ''}{fits.total ? <b>{localCountsText(fits)}</b> : 'No local models listed yet'}</>}</span>;
}
type DeployProbe = { configured: boolean; connected: boolean; code: string; message: string; checkedAt: number; nodes: { checked: boolean; count: number | null; note: string | null }; missing: string[];
  recipes: { id: string; label: string; ready: boolean | null; missingNodes: string[]; missingModels: string[] }[] };
type DeployInfo = { label: string; configured: boolean; via: 'comfy-deploy' | 'runner' | null; reason: string | null; reasonCode: string | null; envVars: { url: string; key: string; runnerUrl: string; runnerToken: string }; lastProbe: DeployProbe | null };
/** H3 runner Step 1: "Your Comfy deployment" (GET /api/comfy-deploy: names only; Check = the free probe GET /api/comfy-deploy/probe?nodes=1, never a job). */
/** Your plans (prices in dollars, 2026-10-26): the Comfy plan, from the account when Comfy's API says it (it doesn't today), else picked here.
 *  Shown only in price details ("on your Creator plan"); every Comfy plan and top-up works out to about 211 Comfy credits per $1, so the
 *  dollar prices don't change. Rates: server/src/shared/priceText.ts COMFY_PLANS (source and date). PUT /api/settings/billing {comfyPlan}. */
function PlansCard() {
  const bill = useBilling(); const v = bill?.plans?.comfy; const [msg, setMsg] = useState('');
  if (!bill || !v) return null;
  const cur = v.options.find(o => o.id === v.plan) ?? null;
  const pick = (id: ComfyPlanId | null) => { if (id === v.picked) return; setMsg('Saving…'); saveBilling({ comfyPlan: id }).then(() => setMsg('Saved')).catch(e => setMsg(`Couldn’t save: ${(e as Error).message}`)).finally(() => setTimeout(() => setMsg(''), 2000)); };
  const state = v.source === 'picked' ? 'Picked by you' : v.source === 'detected' ? 'Read from your account' : 'Not set';
  return <div className="conn-card conn-plans" data-testid="plans-card">
    <div className="conn-t"><ProvMark id="comfy" />Comfy Cloud plan <StatusPill tone={v.plan ? 'ok' : 'calm'} testId="plans-state">{v.plan ? `${cur?.label ?? v.plan} · ${state.toLowerCase()}` : state}</StatusPill></div>
    <div className="conn-plans-pick"><div className="subtabs" role="radiogroup" aria-label="Your Comfy plan">{v.options.map(o => <button key={o.id} type="button" role="radio" aria-checked={v.plan === o.id} className={v.plan === o.id ? 'on' : ''} disabled={!bill.canWrite} data-testid={`plan-${o.id}`}
      title={`${planRateText(o)}. Source: ${o.sourceUrl} (checked ${o.checkedAt}).`} onClick={() => pick(o.id)}>{o.label}</button>)}</div>
      {v.picked && bill.canWrite && <button type="button" className="link-btn" data-testid="plan-clear" onClick={() => pick(null)}>{v.detected ? 'Use the detected plan' : 'Clear'}</button>}</div>
    <p className="helper conn-help" data-testid="plans-line">{cur ? <>{planRateText(cur)}. Prices on Comfy say “on your {cur.id === 'payg' ? 'pay-as-you-go account' : `${cur.label} plan`}” in their details.</> : v.detectNote}{' '}
      <a href={cur?.sourceUrl ?? 'https://www.comfy.org/cloud/pricing'} target="_blank" rel="noreferrer">Comfy Cloud pricing<span aria-hidden> ↗</span></a>{cur ? ` (checked ${cur.checkedAt})` : ''}.{!bill.canWrite ? ` ${bill.writeNote}` : ''}{msg && ` ${msg}`}</p>
    <div className="conn-facts"><span>fal, Replicate and direct APIs bill per use: no plan to pick</span></div>
  </div>;
}
type SetupItem = { id: string; name: string; unlocks: string; kind: 'import' | 'deployment'; file: string | null; type: string | null; size: string | null; link: string; linkLabel: string; steps: string[];
  state: 'ready' | 'missing' | 'unknown' | 'no_key' | 'not_checked'; note: string | null };
/** One-time setup (2026-10-27, docs/COMFY-CLOUD-SETUP.md): the three files to import into your Comfy Cloud library and CrossView's deployment. Each row says
 *  what it unlocks, a free ✓ / Not yet check (GET /api/comfy-cloud/setup?check=1: the routes' own GET-only probes, never a job), the Hugging Face link and
 *  the steps, the same steps a run shows when that file is missing. None of these is a default, so a first run never needs one. */
function CloudSetupCard() {
  const [items, setItems] = useState<SetupItem[] | null>(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [at, setAt] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(() => (location.hash.startsWith('#cloud-setup-') ? location.hash.slice('#cloud-setup-'.length) : null));
  const load = async (check: boolean) => { if (check) setBusy(true); setErr(''); try { const r = await fetch(`/api/comfy-cloud/setup${check ? '?check=1' : ''}`); if (!r.ok) throw new Error(`HTTP ${r.status}`); const j = await r.json(); setItems(j.items); setAt(j.checkedAt); }
    catch { setErr('Couldn’t reach the server.'); } finally { setBusy(false); } };
  useEffect(() => { void load(false); }, []);
  /* #cloud-setup-<id> (a refused run's "Show the steps"): scroll to that row once the list is in, steps open */
  useEffect(() => { if (!items || !location.hash.startsWith('#cloud-setup')) return; const id = location.hash.slice('#cloud-setup-'.length); if (id && items.some(i => i.id === id)) setOpen(id);
    setTimeout(() => document.getElementById(location.hash.slice(1))?.scrollIntoView({ block: 'center' }), 30); }, [!!items]);
  if (!items) return null;
  const done = items.filter(i => i.state === 'ready').length;
  const pill = (i: SetupItem) => i.state === 'ready' ? <StatusPill tone="ok" testId={`setup-st-${i.id}`}>Ready</StatusPill> : i.state === 'not_checked' ? <StatusPill tone="calm" testId={`setup-st-${i.id}`}>Not checked</StatusPill>
    : i.state === 'unknown' ? <StatusPill tone="calm" testId={`setup-st-${i.id}`} title={i.note ?? undefined}>Couldn’t check</StatusPill> : <StatusPill tone="off" testId={`setup-st-${i.id}`} title={i.note ?? undefined}>Not yet</StatusPill>;
  return <div className="conn-card conn-setup" id="cloud-setup" tabIndex={-1} data-testid="conn-card-setup">
    <div className="conn-t"><ProvMark id="comfy" />One-time setup {at ? <StatusPill tone={done === items.length ? 'ok' : 'calm'} testId="setup-summary">{done} of {items.length} ready</StatusPill> : null}</div>
    <div className="conn-acts"><button type="button" className="btn btn-sm btn-ghost" disabled={busy} aria-busy={busy} onClick={() => void load(true)} data-testid="setup-check">{busy ? 'Checking…' : at ? 'Check again' : 'Check'}</button></div>
    <p className="helper conn-help">Some workflows need a one-time model import or your own Comfy deployment. Follow the setup below for the workflow you want. Check is free: it only looks, never runs anything.</p>
    <ul className="conn-setup-list" data-testid="setup-list">{items.map(i => <li key={i.id} id={`cloud-setup-${i.id}`} data-state={i.state} data-testid={`setup-${i.id}`}>
      <div className="conn-setup-row"><span className="conn-setup-t"><b>{i.name}</b><small className="helper">{i.unlocks}</small></span>{pill(i)}</div>
      <div className="conn-setup-acts"><a className="conn-link" href={i.link} target="_blank" rel="noreferrer" data-testid={`setup-link-${i.id}`}>{i.linkLabel}<span aria-hidden>{'\u00a0'}↗</span></a>
        <button type="button" className="link-btn conn-link" aria-expanded={open === i.id} aria-controls={`cloud-setup-steps-${i.id}`} onClick={() => setOpen(o => (o === i.id ? null : i.id))} data-testid={`setup-steps-btn-${i.id}`}>{open === i.id ? 'Hide steps' : 'How to add it'}</button>
        {i.file && <small className="helper conn-setup-file">{i.type}{i.size ? ` · ${i.size}` : ''}</small>}</div>
      {open === i.id && <ol className="conn-setup-steps" id={`cloud-setup-steps-${i.id}`} data-testid={`setup-steps-${i.id}`}>{i.steps.map((s, k) => <li key={k}>{s}</li>)}</ol>}
      {i.note && i.state !== 'ready' && at && <small className="helper">{i.note}</small>}
    </li>)}</ul>
    {err && <Notice as="span" kind="error" tone="line">{err}</Notice>}
  </div>;
}
function DeployCard() {
  const [d, setD] = useState<DeployInfo | null>(null); const [p, setP] = useState<DeployProbe | null>(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  useEffect(() => { fetch('/api/comfy-deploy').then(r => r.ok ? r.json() : null).then((j: DeployInfo | null) => { if (j) { setD(j); setP(j.lastProbe); } }).catch(() => 0); }, []);
  const check = async () => { setBusy(true); setErr(''); try { const r = await fetch('/api/comfy-deploy/probe?nodes=1'); if (!r.ok) throw new Error(`HTTP ${r.status}`); setP(await r.json()); } catch { setErr('Couldn’t reach the server.'); } finally { setBusy(false); } };
  if (!d) return null;
  const miss = p?.missing ?? []; const missLine = miss.length ? `missing: ${miss[0]}${miss.length > 1 ? ` +${miss.length - 1}` : ''}` : ''; // the full list is on the lines below
  const tone: 'ok' | 'calm' | 'warn' | 'off' = !d.configured ? 'off' : !p ? 'calm' : !p.connected ? 'warn' : miss.length ? 'warn' : 'ok';
  const pill = !d.configured ? 'Not set up' : !p ? 'Set, not checked' : !p.connected ? 'Not connected' : [`Connected`, p.nodes.count != null ? `${p.nodes.count.toLocaleString()} node${p.nodes.count === 1 ? '' : 's'}` : null, missLine || null].filter(Boolean).join(' · ');
  const env = d.envVars; const where = d.via === 'runner' ? 'your own GPU runner (Comfy API v2)' : 'your Comfy API deployment';
  return <div className={`conn-card conn-deploy${tone === 'ok' ? ' is-on' : ''}`} id="conn-deploy" data-testid="conn-card-deploy">
    <div className="conn-t"><ProvMark id="comfy" />{d.label} <StatusPill tone={tone} testId="deploy-status" title={p?.message}>{pill}</StatusPill></div>
    <div className="conn-acts">{d.configured && <button type="button" className="btn btn-sm btn-ghost" disabled={busy} aria-busy={busy} onClick={() => void check()} data-testid="deploy-check">{busy ? 'Checking…' : p ? 'Check again' : 'Check'}</button>}</div>
    <div className="conn-facts"><span>For big workflows your computer can’t run</span><span>{d.via === 'runner' ? 'Billed by your GPU host' : 'Billed per GPU-second on your Comfy plan'}</span>{p && <span>Checked {ago(new Date(p.checkedAt).toISOString())}</span>}</div>
    {!d.configured && <p className="helper conn-help" data-testid="deploy-help">{d.reasonCode !== 'deploy_missing' && d.reason ? `${d.reason}. ` : ''}Set it up once on platform.comfy.org, then it runs from here. <Link to={repoDoc('docs/CONFIGURATION.md', 'your-comfy-deployment')} className="conn-link">How to set it up ↗</Link></p>}
    {!d.configured && <TechDetails summary="Details" className="conn-help conn-details" testId="deploy-details"><p className="helper">Create a Build on platform.comfy.org, deploy it with min 0 workers, then put its address in <code>{env.url}</code> (it uses your <code>{env.key}</code>).</p></TechDetails>}
    {d.configured && !p && <p className="helper conn-help" data-testid="deploy-help">Jobs on these routes go to {where}. Check reads the address and the node list. It never starts a job.</p>}
    {p && !p.connected && <p className="helper conn-help" data-testid="deploy-help">{p.message}.</p>}
    {p?.connected && !p.nodes.checked && <p className="helper conn-help" data-testid="deploy-help">{p.nodes.note ?? 'Node list not checked'}, so missing nodes can’t be listed here.</p>}
    {p?.connected && p.nodes.checked && <ul className="conn-deploy-list" data-testid="deploy-recipes">{p.recipes.map(r => <li key={r.id} data-ready={String(r.ready)}><b>{r.label}</b>{' '}{r.ready ? 'ready' : `needs ${[...r.missingNodes, ...r.missingModels].join(', ')}`}</li>)}</ul>}
    {err && <Notice as="span" kind="error" tone="line" testId="deploy-err">{err}</Notice>}
  </div>;
}
/** Test a ComfyUI address (POST /api/local/comfy/test). Saving the address lives in Self-host → Local setup. */
function GpuTest() {
  const [url, setUrl] = useState(''); const [busy, setBusy] = useState(false); const [res, setRes] = useState<{ ok: boolean; t: string } | null>(null);
  useEffect(() => { fetch('/api/local/comfy').then(r => r.ok ? r.json() : null).then(j => { if (j?.url) setUrl(String(j.url)); }).catch(() => 0); }, []);
  const test = async () => { setBusy(true); setRes(null); try { const r = await fetch('/api/local/comfy/test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(url.trim() ? { url: url.trim() } : {}) });
    const j = await r.json().catch(() => null); setRes(j?.reachable ? { ok: true, t: `Found ComfyUI${j.version ? ` ${j.version}` : ''}${j.latencyMs != null ? ` · ${j.latencyMs} ms` : ''}.` } : { ok: false, t: plainCopy(String(j?.error ?? 'Couldn’t reach ComfyUI at that address.')) }); }
    catch { setRes({ ok: false, t: 'Couldn’t reach the server.' }); } finally { setBusy(false); } };
  return <div className="conn-test"><label className="sr-only" htmlFor="conn-gpu-url">ComfyUI address</label>
    <input id="conn-gpu-url" className="conn-input" type="url" inputMode="url" placeholder="http://127.0.0.1:8188" value={url} onChange={e => setUrl(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void test(); }} data-testid="conn-gpu-url" />
    <button type="button" className="btn btn-sm btn-ghost" disabled={busy} aria-busy={busy} onClick={() => void test()} data-testid="conn-gpu-test">{busy ? 'Testing…' : 'Test'}</button>
    {res && <Notice as="span" kind={res.ok ? 'success' : 'error'} tone="line" className="conn-gpu-res" testId="conn-gpu-result">{res.t}</Notice>}</div>;
}

/** C6: balance on its own two rows: value (warn chip when empty), then "Checked … · Refresh" in muted text. A skeleton while loading. */
function Balance({ id, name, real, acct, info }: { id: string; name: string; real: boolean; acct?: Account; info?: ProviderBilling }) {
  const [busy, setBusy] = useState(false);
  const refresh = () => { setBusy(true); void refreshAccounts().finally(() => setBusy(false)); };
  if (!info && !acct) return null;
  if (acct?.mock && acct.balanceUsd == null) return <div className="conn-bal" data-testid={`prov-acct-${id}`}><span className="conn-bal-v" title={acct.mock.note}><span className="conn-bal-l">Sample balance</span> <b>{fmtUsd(acct.mock.balanceUsd)}</b> <small>(no key)</small></span></div>;
  if (info && info.balance !== 'api') return <div className="conn-bal" data-testid={`prov-acct-${id}`}><span className="conn-bal-v conn-muted">{name} has no balance API</span></div>;
  if (!real) return <div className="conn-bal" data-testid={`prov-acct-${id}`}><span className="conn-bal-v conn-muted">Balance shows once a key is added</span></div>;
  const usd = acct?.balanceUsd;
  return <div className="conn-bal" data-testid={`prov-acct-${id}`} aria-busy={!acct}>
    <span className="conn-bal-v"><span className="conn-bal-l">Balance</span>{' '}
      {usd != null ? <><b title={balanceDetail({ units: acct?.balance ?? null, unitLabel: acct?.balanceUnit ?? null, plan: id === 'comfy' ? comfyPlanNow() : null, checked: acct?.fetchedAt ? ago(acct.fetchedAt) : null }) ?? undefined} data-testid={`conn-bal-usd-${id}`}>{balanceText(usd)}</b>{usd <= 0 && <> <StatusPill tone="warn" testId={`conn-bal-empty-${id}`} title="Runs on this account will be refused until you add funds.">Empty</StatusPill></>}</>
        : acct ? <span className="conn-muted">{acct.note || 'Not available right now'}</span>
        : <span className="conn-skel skel-i" role="status" aria-label="Loading balance" />}</span>
    {acct && <span className="conn-bal-meta">{acct.fetchedAt ? `Checked ${ago(acct.fetchedAt)}` : 'Not checked yet'} · <button type="button" className="link-btn conn-link" disabled={busy} aria-busy={busy} onClick={refresh} data-testid={`conn-refresh-${id}`}>{busy ? 'Checking…' : 'Refresh'}</button></span>}
  </div>;
}

/** One account card: mark, status, key (never shown), balance, unlocks, failure rule, links, Add / Replace / Remove. */
function KeyCard({ p, info, acct, canStore, unlock, onDone, note, hostedOff, factsLine }: { p?: Prov; info?: ProviderBilling; acct?: Account; canStore: boolean; unlock: { n: number; names: string[] }; onDone: () => void; note?: string; hostedOff?: boolean; /** replaces the Unlocks line (an account that isn't a place to run) */ factsLine?: string }) {
  const [adding, setAdding] = useState(false); const [key, setKey] = useState(''); const [busy, setBusy] = useState(''); const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  if (!p) return null; const id = p.id; const name = NAME[id] ?? p.name; const real = p.configured && !p.mockedKey; const off = hostedOff && id !== 'comfy' && id !== 'hf'; const token = id === 'hf';
  const save = async () => { const v = key.trim(); if (!v) return; setBusy('save'); setMsg(null);
    try { const r = await fetch('/api/settings/providers', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, key: v }) }); const b = await r.json().catch(() => null);
      if (!r.ok) throw new Error(plainCopy(String(b?.error ?? `Couldn’t save the key (HTTP ${r.status}).`))); setKey(''); setAdding(false); setMsg({ ok: true, t: `${name} key saved. It’s never shown again.${b?.keyFormat === 'unchecked' ? ' It will be checked the first time you run something on it.' : ''}` }); onDone(); }
    catch (e) { setMsg({ ok: false, t: (e as Error).message }); } finally { setBusy(''); } };
  const remove = async () => { if (!(await askConfirm({ title: `Remove the ${name} key?`, body: `Models that run on ${name} go back to other places you’ve set up, or to free samples. You can add it again any time.`, confirm: 'Remove key', cancel: 'Keep it', danger: true }))) return; setBusy('rm'); setMsg(null);
    try { const r = await fetch(`/api/settings/providers/${encodeURIComponent(id)}`, { method: 'DELETE' }); const b = await r.json().catch(() => null); if (!r.ok) throw new Error(plainCopy(String(b?.error ?? `Couldn’t remove it (HTTP ${r.status}).`)));
      setMsg({ ok: true, t: b?.stillConfigured ? `Saved ${name} key removed. ${name} is still connected: the server’s environment sets ${b.stillFromEnvVar ?? 'a key'}. Remove it there to disconnect.` : `${name} key removed.` }); onDone(); } catch (e) { setMsg({ ok: false, t: (e as Error).message }); } finally { setBusy(''); } };
  const status = off ? <StatusPill tone="off" testId={`prov-st-${id}`}>Off (open weights only)</StatusPill> : real && p.keyFormat === 'unchecked' ? <StatusPill tone="calm" testId={`prov-st-${id}`} title="This key’s format can’t be checked here, so it is tried on the first run.">Saved, checked on first run</StatusPill> : real && p.keyFormat === 'unexpected' ? <StatusPill tone="warn" testId={`prov-st-${id}`} title="This key doesn’t look like a key from this provider. Replace it if runs fail.">Key looks wrong</StatusPill> : real ? <StatusPill tone="ok" testId={`prov-st-${id}`}>Connected</StatusPill> : p.mockedKey ? <StatusPill tone="warn" testId={`prov-st-${id}`}>Sample · no key</StatusPill> : <StatusPill tone="off" testId={`prov-st-${id}`}>Not connected</StatusPill>;
  const whyId = `conn-why-${id}`; const rule = info ? RULE_CHIP[info.failureRule] : null;
  return <div className={`conn-card${real ? ' is-on' : ''}`} id={`conn-${id}`} data-testid={`conn-card-${id}`}>
    <div className="conn-t"><ProvMark id={id} />{name}{status}</div>
    <div className="conn-acts">{!off && (canStore
      ? (real ? <>{p.keySource === 'saved' && <button type="button" className="btn btn-sm btn-ghost" disabled={!!busy} onClick={() => void remove()} data-testid={`conn-remove-${id}`}>{busy === 'rm' ? 'Removing…' : 'Remove'}</button>}{!adding && <button type="button" className="btn btn-sm btn-ghost" onClick={() => setAdding(true)} aria-expanded={adding} data-testid={`conn-replace-${id}`}>Replace</button>}</>
        : !adding && <button type="button" className="btn btn-sm btn-primary" onClick={() => setAdding(true)} aria-expanded={adding} data-testid={`conn-add-${id}`}>{token ? 'Add token' : 'Add key'}</button>)
      /* C1: visible but off, with the reason right under it */
      : <button type="button" className={`btn btn-sm ${real ? 'btn-ghost' : 'btn-primary'} conn-btn-off`} aria-disabled="true" aria-describedby={whyId} data-testid={real ? `conn-replace-${id}` : `conn-add-${id}`} onClick={jumpTo('conn-keys-off')}>{real ? 'Replace' : token ? 'Add token' : 'Add key'}</button>)}</div>
    {!off && !canStore && <p className="conn-why" id={whyId} data-testid={`conn-why-${id}`}>{real
      ? <>{p.envKey ? <>Set as <code>{p.envKey}</code> in <code>.env.local</code>. To change it, edit that line and restart, or </> : 'Set in the server’s settings file. To change it, '}<a href="#conn-keys-off" className="conn-link" onClick={jumpTo('conn-keys-off')}>turn on adding keys here</a>.</>
      : <>Adding keys here is off on this server.{p.envKey ? <> Use <code>{p.envKey}</code> in <code>.env.local</code>, or </> : ' '}<a href="#conn-keys-off" className="conn-link" onClick={jumpTo('conn-keys-off')}>{p.envKey ? 'see how to turn it on' : 'See how to turn it on'}</a>.</>}</p>}
    {adding && canStore && <form className="conn-key" onSubmit={e => { e.preventDefault(); void save(); }}>
      <label className="sr-only" htmlFor={`conn-key-${id}`}>{token ? `${name} read token` : `${name} API key`}</label>
      <input id={`conn-key-${id}`} className="conn-input" type="password" autoComplete="off" spellCheck={false} placeholder={token ? 'Paste a Hugging Face read token (hf_…)' : `Paste your ${name} API key`} value={key} onChange={e => setKey(e.target.value)} autoFocus data-testid={`conn-key-input-${id}`} />
      <button type="submit" className="btn btn-sm btn-primary" disabled={!key.trim() || !!busy} aria-busy={busy === 'save'} data-testid={`conn-save-${id}`}>{busy === 'save' ? 'Saving…' : 'Save key'}</button>
      <button type="button" className="btn btn-sm btn-ghost" onClick={() => { setAdding(false); setKey(''); }}>Cancel</button>
      <small className="helper conn-key-help">Stored on this computer in the server’s settings file. It’s never shown again here.</small></form>}
    <div className="conn-facts">
      {real && <span data-testid={`conn-key-${id}`}>Key <b>•••• set</b>{p.keySetAt ? ` · added ${dateOf(p.keySetAt)}` : p.keySource === 'env' ? (p.keyEnvVar ? ` · set as ${p.keyEnvVar} in the server’s environment` : ' · in the server’s settings file') : ''}</span>}
      {factsLine ? <span data-testid={`conn-facts-${id}`}>{factsLine}</span> : <Unlocks u={unlock} where={name} empty="Saved keys work, but nothing runs on it on this server yet" />}
      {info?.actualCost === 'per-job' && <span title={info.actualNote}>Reports the real cost per run</span>}
      {note && <span className="conn-note">{note}</span>}
    </div>
    <Balance id={id} name={name} real={real} acct={acct} info={info} />
    {(rule || info?.billingUrl || p.keysUrl) && <div className="conn-foot">
      {rule && <StatusPill tone={rule[1]} title={info?.failureNote} testId={`conn-rule-${id}`}>{rule[0]}</StatusPill>}
      <span className="conn-links">{!real && p.keysUrl && !off && <a href={p.keysUrl} target="_blank" rel="noreferrer" className="conn-link" data-testid={`prov-connect-${id}`}>{token ? 'Create a read token ↗' : 'Get a key ↗'}</a>}{info?.billingUrl && <a href={info.billingUrl} target="_blank" rel="noreferrer" className="conn-link" data-testid={`prov-billing-${id}`}>{name} billing ↗</a>}</span>
    </div>}
    {real && canStore && p.keySource === 'env' && <p className="helper conn-help">Set in the server’s settings file or environment{p.keyEnvVar ? <> (<code>{p.keyEnvVar}</code>)</> : null}, so it can be replaced here but not removed.</p>}
    {msg && <p className={msg.ok ? 'helper conn-ok' : 'inline-err'} role={msg.ok ? 'status' : 'alert'} data-testid={`conn-msg-${id}`}>{msg.t}</p>}
  </div>;
}

/** Settings → Routing: how a place is pre-selected, your choices per tool (Reset), run setup again. No Auto mode and no fallback switch (2026-10-22): a failed run offers "Try on <place>" instead. */
export function RoutingPrefs() {
  const rt = useRouting(); const [saved] = usePutGlobal();
  useEffect(() => { void loadRouting(true); }, []);
  return <section className="set-sec conn" id="routing" aria-labelledby="route-h" aria-busy={!rt} data-testid="settings-routing">
    <div className="conn-sec-h"><h2 id="route-h">Routing</h2>{saved && <small className="helper" role="status">{saved}</small>}</div>
    <p className="conn-lede">Where each model runs. Until you choose, each model runs on the first option that’s ready: Comfy Cloud, your other keys, then your computer. Nothing that needs a download or a key is picked for you. Your choices stay put.</p>
    {!rt && <Skeleton variant="rows" count={3} label="Loading routing" />}
    {rt && <div className="conn-card conn-route">
      <Choices rt={rt} />
      <OtherProviders rt={rt} />
      <div className="conn-pref conn-pref-row"><span><b>Setup</b><small className="helper">Answer “How do you want to run?” again.</small></span><button type="button" className="btn btn-sm" data-testid="run-setup-again" onClick={() => openRunSetup()}>Run setup again</button></div>
    </div>}
  </section>;
}

/** Show other providers (2026-10-27): fal, Replicate and the labs' own APIs come back in menus, Run on and Connections. Off by default: a model Comfy (or
 *  your computer) already runs shows only that place, unless another place is the only way to get it or does something Comfy can't. Keys keep working. */
function OtherProviders({ rt }: { rt: any }) {
  const [saved, put] = usePutGlobal(); const on = !!rt?.global?.showOtherProviders;
  return <div className="conn-pref conn-pref-row" data-testid="show-other-providers"><span><b id="show-other-lbl">Show other providers</b><small className="helper" id="show-other-help">fal, Replicate and the labs’ own APIs, for models Comfy already runs. Off keeps menus to one key. Saved keys keep working either way.{saved && <span role="status"> {saved}</span>}</small></span>
    <button type="button" role="switch" aria-checked={on} aria-labelledby="show-other-lbl" aria-describedby="show-other-help" data-testid="show-other-switch" className={`toggle-ui-btn prov-sw ${on ? 'on' : ''}`} onClick={() => void put({ showOtherProviders: !on })}><i /></button></div>;
}

/** "Your choices per tool": every (tool, model) with a picked place, with Reset (back to the pre-selected place); old per-model pins show too and reset the same way.
 *  C8: when nothing is picked it's one quiet line, not a row that looks like a control. */
function Choices({ rt }: { rt: any }) {
  const [busy, setBusy] = useState(''); const [err, setErr] = useState('');
  const rows: { tool: string; model: string; e: any }[] = []; for (const [t, ms] of Object.entries<any>(rt.perTool ?? {})) for (const [m, e] of Object.entries<any>(ms ?? {})) if (e && (e.route || (e.runOn ?? 'auto') !== 'auto')) rows.push({ tool: t, model: m, e });
  const clear = async (k: string, fn: () => Promise<void>) => { setBusy(k); setErr(''); try { await fn(); } catch (e) { setErr((e as Error).message); } finally { setBusy(''); } };
  const one = (r: { tool: string; model: string; e: any }) => clear(`${r.tool}:${r.model}`, async () => {
    const cur = routingNow(); const body: any = {};
    if (r.e.source === 'legacy' && r.e.engine) { const pm = { ...(cur?.perModel ?? {}) }; delete pm[r.e.engine]; body.perModel = pm; }
    else { const pt: any = {}; for (const [t, ms] of Object.entries<any>(cur?.perTool ?? {})) for (const [m, e] of Object.entries<any>(ms ?? {})) { if (!e || e.source === 'legacy' || (t === r.tool && m === r.model)) continue; if (!e.route && (!e.runOn || e.runOn === 'auto')) continue; (pt[t] ??= {})[m] = { runOn: e.runOn, ...(e.route ? { route: e.route } : {}) }; } body.perTool = pt; }
    const res = await fetch('/api/me/routing', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); const b = await res.json().catch(() => null); if (!res.ok) throw new Error(String(b?.error ?? `HTTP ${res.status}`)); setRouting(b); requestRequote(); });
  if (!rows.length) return <p className="helper conn-choices-empty" data-testid="pins-heading"><b>Your choices per tool:</b> none yet, so every model runs on the default. Pick a place in a model’s Run on menu to keep it for that tool.</p>;
  return <div className="conn-pref conn-choices" data-testid="pins-heading"><span><b>Your choices per tool</b><small className="helper">These models run where you picked. Everything else runs on the default.</small>
    <ul className="conn-list">{rows.map(r => <li key={`${r.tool}:${r.model}`} data-testid={`pin-${r.tool}-${r.model}`}><span><b>{toolLike(r.tool)?.name ?? r.tool}</b> · {r.e.modelName ?? r.model} → {r.e.runOnLabel ?? r.e.runOn}</span>
      <button type="button" className="link-btn conn-link" disabled={!!busy} data-testid={`unpin-${r.tool}-${r.model}`} aria-label={`Reset ${r.e.modelName ?? r.model} on ${toolLike(r.tool)?.name ?? r.tool} to the default`} onClick={() => void one(r)}>{busy === `${r.tool}:${r.model}` ? 'Resetting…' : 'Reset'}</button></li>)}</ul>
    {err && <Notice as="span" kind="error" tone="line">{err}</Notice>}</span>
    {rows.length > 1 && <button type="button" className="btn btn-sm btn-ghost" disabled={!!busy} data-testid="pins-reset-all" onClick={() => void clear('all', () => resetRunOns())}>{busy === 'all' ? 'Resetting…' : 'Reset all'}</button>}</div>;
}
