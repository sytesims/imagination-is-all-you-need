/**
 * "Run on" (MODEL-ROUTE-SPEC §2.3; 2026-10-22: no Auto): where a model runs and who bills it, one choice per PLACE, in three groups:
 * Local (local ComfyUI, free), Comfy Cloud (one Comfy key: open workflows and partner models) and Other API (fal, Replicate, BFL…, one row each with its price).
 * Only the places the model really has are listed; a place that isn't set up stays, greyed, with its one action (Download, Install node,
 * Add a key, Turn on). With no saved choice the place shown is the PRE-SELECTED one (first ready: Comfy → other API → Local; else the mock
 * sample; else none: "Not set up", and the setup card asks), named on the chip. Picking saves it per (tool, model) (PUT /api/me/routing perTool); a saved place that stops working
 * shows its state and fix here and on the chip, it never switches on its own. Sits under the Model field in side panels (RunOnField) and
 * as a chip in the Create Image dock (RunOnChip); both open RunOnMenu (shared Popover: a bottom sheet on phones).
 */
import { Notice } from '../../shared/Notice';
import { tip } from '../../shared/Tooltip';
import { forwardRef, useRef, useState, type RefObject } from 'react';
import { type PopPlacement } from '../../shared/Popover';
import { BarPopover } from '../../shared/BarPop';
import { Link } from '../../platform/router';
import { useLastQuote } from '../../shared/quote';
import { ChevronRightIcon, placeIconFor } from '../Icons';
import { useBilling, RULE_TEXT, modeOf, priceDetail, type FailureRule } from '../../shared/billing';
import { setDownloadIntent, useHardware, useLiveHardware } from '../../shared/hardware';
import { machineLabel, hereLine, memoryCheck, freeForModelsGB, HEAVY_GB } from '../../../../server/src/shared/thisComputer';
import { navigate } from '../../platform/router';
import { setRoute, routeChoiceOf, noteToolModels, type RouteChoice } from '../../shared/models';
import { requestRequote } from '../../shared/quote';
import { RUN_ON_BILLING, billsText, comfyVariantText, enginesModels, listPrice, runOnLabel, setActiveModel, setRunOn, setRouting, statusDot, STATUS_WORD, CHIP_ACTION_WORD,
  placeOf, toolLike, useRunOn, useToolModels, getRunOn, type RunOnRow, type ToolModel, type PlaceAction, shownName, RUN_ON_CHIP, rowPlaceLabel } from '../../shared/models';
import { LOCAL_LABEL, COMFY_DEPLOY_DETAIL } from '../../../../server/src/shared/modelIds';

/** Kept for callers: the place the pre-selection resolved for this job (the live quote's place, else the listing's). */
export const autoPlaceOf = (m: ToolModel | undefined, q?: any): string | null => placeOf(m, null, q);
/** The chip / field words: always the place's name ('Local', 'Comfy', 'fal'), plus a short state when it can't run as is. */
export function runOnText(m: ToolModel | undefined, pick: string, q?: any): { main: string; sub: string; dot: 'ok' | 'demo' | 'off' | null; tip: string; place: string | null; saved: boolean; action: PlaceAction | null } {
  const saved = !!pick && pick !== 'auto'; const place = placeOf(m, pick, q);
  const row = m?.runsOn.find(r => r.id === place);
  if (!place) return { main: 'Not set up', sub: '', dot: 'demo', tip: `${m?.name ?? 'This model'} can’t run anywhere yet. Pick one to set up (the card above Generate).`, place: null, saved: false, action: null }; // nothing pre-selected
  const qHere = !!q && q.runOn === place && (!q.modelKey || !m || q.modelKey === m.key);
  const qAction: PlaceAction | null = qHere && q.runnable === false && q.setup && q.setup.runOn === place ? { kind: q.setup.action, text: q.setup.actionText, missingBytes: q.setup.missingBytes ?? null, downloadId: q.setup.downloadId ?? null } : null;
  let st: string = row?.status ?? 'ready';
  if (qHere) st = q.demo ? 'sample' : q.runnable === false ? (q.needsKey ? 'needs-key' : q.reasonCode === 'weights_missing' || q.reasonCode === 'nodes_missing' ? 'not-installed' : st === 'ready' ? 'unavailable' : st) : 'ready';
  const action = st === 'ready' ? null : qAction ?? row?.action ?? null;
  const ch = qHere ? routeChoiceOf(m, q.routeId) : null; // the place has several ways to run it: name the one this run uses ("Comfy Cloud · open workflow")
  const name = ch?.name ?? (place ? runOnLabel(place) : 'Not set up');
  const sub = st === 'ready' ? '' : st === 'sample' ? 'Sample' : action ? CHIP_ACTION_WORD[action.kind] ?? action.text : STATUS_WORD[st] ?? '';
  const why = st === 'ready' ? '' : st === 'sample' ? ' Free sample output until you add a key.' : action ? ` ${action.text} to run it here.` : row?.reason ? ` ${String(row.reason).replace(/\.?$/, '.')}` : '';
  const tip = place ? `${m?.name ?? 'This model'} runs on ${name}${saved ? ' (your choice for this tool)' : ' (the default: the first one that’s ready)'}.${why}` : 'Nothing can run this model here yet.';
  return { main: name, sub, dot: st === 'ready' ? null : statusDot(st), tip, place, saved, action };
}

/** Generate's own action when the shown place can't run yet (the quote's setup): Add a key / Turn on / Install node / Set up GPU go
 *  there; Download says yes to the files (the next run fetches them first, then runs) and returns 'run' so the caller generates. */
export async function placeActionGo(setup: { action: string; runOn: string; missingBytes?: number | null; connection?: string }, engine: string | null | undefined): Promise<'run' | 'done'> {
  if (setup.action === 'download') { if (engine) setDownloadIntent(engine, { variantId: null, bytes: setup.missingBytes ?? null }); return 'run'; }
  if (setup.action === 'turn_on') { const r = await fetch('/api/me/routing', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ global: { useLocal: true } }) });
    const b = await r.json().catch(() => null); if (!r.ok) throw new Error(String(b?.error ?? `Couldn’t turn it on (HTTP ${r.status}).`)); setRouting(b); return 'done'; }
  navigate(setup.connection === 'deploy' ? '/settings#conn-deploy' /* the deployment is missing, not the key */ : setup.action === 'add_key' ? `/settings#conn-${RUN_ON_BILLING[setup.runOn] ?? setup.runOn}` : '/settings#gpu'); return 'done';
}

/** The models the Run-on menu offers for this pick. Usually one; an engine that builds several models on this tool (H3 Extend: the open H3
 *  graph locally, H3 Max on fal) lists each model's places, so the place also says which model runs. */
function modelsFor(toolId: string, m: ToolModel | undefined, engine?: string | null): ToolModel[] {
  if (!m) return []; if (!engine) return [m]; const ms = enginesModels(toolId, engine);
  return ms.length > 1 && ms.every(x => x.engines.length === 1) ? ms : [m];
}

type FieldProps = { toolId: string; model: ToolModel | undefined; engine?: string | null; quote?: any; testId?: string; placement?: PopPlacement; avoid?: RefObject<HTMLElement | null> };
/** Side panel field, the same 48px card as the Model field. No price here: the price is on the Generate button (one price per place). */
export function RunOnField({ toolId, model, engine, quote: q0, testId = 'run-on', placement = 'right', avoid }: FieldProps) {
  const lq = useLastQuote(toolId); const quote = q0 ?? lq; const ref = useRef<HTMLButtonElement>(null); const [open, setOpen] = useState(false);
  const pick = useRunOn(toolId, model?.key).runOn; const t = runOnText(model, pick, quote);
  if (!model) return null;
  return <><RunOnButton ref={ref} open={open} onClick={() => setOpen(o => !o)} text={t} testId={testId} />
    <RunOnMenu open={open} anchor={ref} avoid={avoid} placement={placement} onClose={() => setOpen(false)} toolId={toolId} model={model} engine={engine} quote={quote} /></>;
}
const RunOnButton = forwardRef<HTMLButtonElement, { open: boolean; onClick: () => void; text: ReturnType<typeof runOnText>; testId: string }>(function RunOnButton({ open, onClick, text, testId }, ref) {
  return <button ref={ref} type="button" className={`vs-model mc-card ro-field${open ? ' on' : ''}`} data-testid={testId} data-place={text.place ?? undefined} data-saved={text.saved ? '1' : undefined} aria-haspopup="dialog" aria-expanded={open} title={text.tip} onClick={onClick}>
    <span className="vs-cap">Run on</span><b className="ro-val">{text.dot && <i className={`mp-st mp-st-${text.dot}`} aria-hidden />}<span>{text.main}</span>{text.sub && <span className="ro-sub">· {text.sub}</span>}</b>
    <i className="mc-chev" aria-hidden><ChevronRightIcon size={16} /></i></button>;
});
/** Round 1 (S1): Story keeps its own Run-on choice (remembered for Director, not shared with Generate Video) and prices every row as the
 *  whole story: `scale.factor` turns one clip's price into the story's total; `scale.shots` gives the per-shot line. */
export type RunOnOwn = { runOn: string; set: (runOn: string) => void; rememberedFor: string };
export type RunOnScale = { factor: number | null; shots: number; unit: string };
/** Create Image dock: a chip in the scroll track ('Comfy ›', 'Local · Download ›'). */
export function RunOnChip({ toolId, model, engine, quote: q0, testId = 'run-on-chip', avoid, own, scale, watch, compact }: FieldProps & { own?: RunOnOwn; scale?: RunOnScale; /** a composer dock: the menu opens 4px above the chip, over the dock, and re-places when the dock resizes */ watch?: RefObject<HTMLElement | null>;
  /** Create bar: one short word (GPU, Comfy, fal) that never truncates; a needed step shows as the dot, said in full in the label and tooltip */ compact?: boolean }) {
  const lq = useLastQuote(toolId); const quote = q0 ?? lq; const ref = useRef<HTMLButtonElement>(null); const [open, setOpen] = useState(false);
  const shared = useRunOn(toolId, model?.key).runOn; const pick = own ? own.runOn : shared; const t = runOnText(model, pick, quote);
  if (!model) return null;
  return <><button ref={ref} type="button" className={`ic-chip ro-chip${compact ? ' ro-compact' : ''}${open ? ' on' : ''}`} data-testid={testId} data-place={t.place ?? undefined} data-saved={t.saved ? '1' : undefined} aria-haspopup="dialog" aria-expanded={open} aria-label={`Run on: ${t.main}${t.sub ? `, ${t.sub}` : ''}`} {...tip(t.tip)} onClick={() => setOpen(o => !o)}>
      {t.dot && <i className={`mp-st mp-st-${t.dot}`} aria-hidden />}{compact ? <span className="ro-chip-t ro-chip-c">{t.place ? RUN_ON_CHIP[t.place] ?? t.main : 'Set up'}</span> : <span className="ro-chip-t">{t.main}{t.sub ? <span className="ro-sub"> · {t.sub}</span> : null}</span>}<ChevronRightIcon size={16} /></button>
    <RunOnMenu open={open} anchor={ref} avoid={avoid} watch={watch} gap={watch ? 4 : undefined} placement="top" onClose={() => setOpen(false)} toolId={toolId} model={model} engine={engine} quote={quote} own={own} scale={scale} /></>;
}

const rule = (r: FailureRule | undefined) => (r ? RULE_TEXT[r].replace(/^./, c => c.toLowerCase()) : '');
/** One row's state word and tone. A row that isn't ready stays pickable (the chip then shows the fix); greyed by tone 'off'/'warn'. */
function rowState(r: RunOnRow): { word: string; tone: 'ok' | 'warn' | 'off'; dim: boolean } {
  switch (r.status) {
    case 'ready': return r.here?.untested ? { word: 'Not tested here yet', tone: 'warn', dim: false } /* item 5: a platform variant nobody has run on this kind of computer */ : { word: 'Ready', tone: 'ok', dim: false };
    case 'sample': return { word: 'Sample', tone: 'warn', dim: false };
    case 'needs-key': return { word: 'Needs a key', tone: 'warn', dim: true };
    case 'off': return { word: 'Off', tone: 'off', dim: true };
    case 'not-installed': return r.reasonCode === 'too_heavy' ? { word: 'Too heavy here', tone: 'warn', dim: true } : r.reasonCode === 'weights_missing' ? { word: 'Files needed', tone: 'off', dim: true } : r.reasonCode === 'nodes_missing' ? { word: 'Node missing', tone: 'off', dim: true } : { word: 'Not set up', tone: 'off', dim: true };
    default: return { word: STATUS_WORD[r.status] ?? 'Not available', tone: 'off', dim: true };
  }
}
/** Listed places: every place the model has, except ones that will never run here (not connected on this server, or off in this mode). */
const listed = (r: RunOnRow) => r.status !== 'coming-soon' && r.status !== 'unavailable';
const GROUPS: { id: 'gpu' | 'comfy' | 'api'; label: string }[] = [{ id: 'gpu', label: LOCAL_LABEL }, { id: 'comfy', label: 'Comfy Cloud' }, { id: 'api', label: 'Your keys' }];
const groupOf = (r: RunOnRow) => r.group ?? (r.id === 'local' ? 'gpu' : r.id === 'comfy-cloud' ? 'comfy' : 'api');
/** The ways one place lists for this model (two or more); Story's own pick (ownPick) keeps one row per place. */
const waysOf = (r: RunOnRow, ownPick?: RunOnOwn) => (!ownPick && r.choices && r.choices.length > 1 ? r.choices : null);
/** The sub-line's how words (server comfyHowLine: "Partner model · via last frame"). Not when the ways are listed under it, nor when
 *  comfyVariantText says it in full, nor the deployment line (the row's name already says Comfy deployment). */
const detailOf = (r: RunOnRow, ways: boolean) => r.id === 'local' ? 'Free and private' : r.id === 'comfy-cloud' && !ways && (r.comfyVariants?.length ?? 0) < 2 && r.detail !== COMFY_DEPLOY_DETAIL ? String(r.detail ?? '') : '';

export function RunOnMenu({ open, anchor, avoid, watch, gap, onClose, toolId, model, engine, quote, placement = 'right', own: ownPick, scale }: { open: boolean; anchor: RefObject<HTMLElement | null>; avoid?: RefObject<HTMLElement | null>; watch?: RefObject<HTMLElement | null>; gap?: number; onClose: () => void; toolId: string; model: ToolModel; engine?: string | null; quote?: any; placement?: PopPlacement; own?: RunOnOwn; scale?: RunOnScale }) {
  useToolModels(toolId); const bill = useBilling(); const own = modeOf(bill, quote) !== 'team';
  const hw = useHardware(); const hwName = machineLabel(hw?.profile); // the Local row names this computer ("Apple M1 Max · 64 GB"), the same name as Settings → Your computer
  const [busy, setBusy] = useState(''); const [err, setErr] = useState('');
  const ms = modelsFor(toolId, model, engine); const multi = ms.length > 1;
  const hereOf = (m: ToolModel) => m.runsOn.find(r => r.id === 'local')?.here ?? null;
  /* the mini line under Local: free memory now (read only while the menu is open on a heavy model) and the time learned here; amber when memory is short */
  const live = useLiveHardware(open && !!hw?.profile && ms.some(m => (hereOf(m)?.memGB ?? 0) >= HEAVY_GB));
  const pickOf = (m: ToolModel) => getRunOn(toolId, m.key);
  const curM = (multi ? ms.find(m => pickOf(m).runOn !== 'auto') : undefined) ?? model; const cur = ownPick ? { runOn: ownPick.runOn } : pickOf(curM);
  const saved = !!cur.runOn && cur.runOn !== 'auto'; const shownPlace = saved ? cur.runOn : placeOf(curM, null, quote);
  /* S1: with a scale (Story), every row is the whole story's price, so the picker and the Generate button show one number */
  const sc = (c: number | null | undefined) => scale ? (scale.factor != null && c != null ? Math.round(c * scale.factor) : null) : c;
  const perShot = (c: number | null | undefined, id: string) => scale && scale.factor != null && c != null && c > 0 && id !== 'local' && scale.shots > 1 ? listPrice(Math.round(c * scale.factor / scale.shots), id, own) : null;
  const ruleOf = (r: RunOnRow) => bill?.providers.find(p => p.id === (RUN_ON_BILLING[r.id] ?? r.id))?.failureRule;
  const toolName = toolLike(toolId)?.name ?? 'this tool';
  const save = async (k: string, fn: () => Promise<void>) => { setBusy(k); setErr(''); try { await fn(); } catch (e) { setErr((e as Error).message); } finally { setBusy(''); } };
  const choose = (m: ToolModel, runOn: string) => ownPick ? (ownPick.set(runOn), onClose()) : save(`${m.key}:${runOn}`, async () => {
    if (multi) { for (const o of ms) if (o.key !== m.key && pickOf(o).runOn !== 'auto') await setRunOn(toolId, o.key, ''); setActiveModel(toolId, runOn ? m.key : null); }
    await setRunOn(toolId, m.key, runOn); onClose(); });
  const turnOnGpu = () => save('gpu', async () => { const r = await fetch('/api/me/routing', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ global: { useLocal: true } }) });
    const b = await r.json().catch(() => null); if (!r.ok) throw new Error(String(b?.error ?? `Couldn’t turn it on (HTTP ${r.status}).`)); setRouting(b); });
  /* Download: the next run locally fetches the files first (the composer's download note says so and can cancel), and Local becomes the choice */
  const download = (m: ToolModel, r: RunOnRow, a: PlaceAction) => { const eng = r.engines[0] ?? engine ?? ''; if (eng) setDownloadIntent(eng, { variantId: null, bytes: a.missingBytes ?? null }); void choose(m, 'local'); };
  /* the place this run quotes shows the run's own price (Extend +10 s, a long clip), not the listing's default-length figure: one number with the button */
  const rowCredits = (r: RunOnRow) => { const qc = quote ? (quote.listCredits ?? quote.credits) : null; return quote && quote.runOn === r.id && typeof qc === 'number' && qc > 0 ? qc : r.credits; };
  const rows = ms.flatMap(m => m.runsOn.filter(listed).map(r => ({ m, r, s: rowState(r) })));
  /* 2026-10-27 (app-wide): a place with two or more ways to run this model lists each by name under it ("Comfy Cloud · open workflow"), with
   * its own price, the sizes and lengths it makes and what makes it different. Picking one is remembered for this tool and model (setRoute). */
  const MODE_WORD: Record<string, string> = { t2v: 'text', i2v: 'photo', flf: 'first and last frame', r2v: 'references', generate: 'text', edit: 'edit', extend: 'extend' };
  const modesText = (c: RouteChoice) => { const ms = (c.modes ?? []).map(x => MODE_WORD[x]).filter(Boolean); return ms.length ? `Only ${ms.join(', ')}` : ''; };
  const limitsText = (c: RouteChoice) => { const l = c.limits; if (!l) return modesText(c); const d = l.durations?.length ? (l.durations.length > 3 && l.durations.every((x, i, a) => i === 0 || x - a[i - 1] === a[1] - a[0]) ? `${l.durations[0]}–${l.durations[l.durations.length - 1]} s` : `${l.durations.join(' / ')} s`) : '';
    return [modesText(c), l.resolutions?.length ? l.resolutions.join(' / ') : '', d].filter(Boolean).join(' · '); };
  /* E1 (2026-11-01): one source for what's checked, so exactly one radio is: the model, the place and, when that place lists its ways, the
   * way (the saved one, else the one this run quotes, else the first ready one: the order the server would pick). A place that lists its
   * ways is a heading, not a radio; its ways are the radios under it. */
  const shownRow = rows.find(x => x.m.key === curM.key && x.r.id === shownPlace); const shownWays = shownRow ? waysOf(shownRow.r, ownPick) : null;
  const selRoute = (() => { if (!shownWays) return null; const has = (id: string | null | undefined) => (id && shownWays.some(c => c.routeId === id) ? id : null);
    return has(saved && !ownPick ? pickOf(curM).route : null) ?? has(quote && quote.runOn === shownPlace ? quote.routeId : null) ?? (shownWays.find(c => c.status === 'ready' || c.status === 'sample') ?? shownWays[0]).routeId; })();
  const isOn = (m: ToolModel, r: RunOnRow, routeId: string | null = null) => curM.key === m.key && shownPlace === r.id && routeId === (waysOf(r, ownPick) ? selRoute : null);
  const choiceRow = (m: ToolModel, r: RunOnRow, c: RouteChoice) => { const on = isOn(m, r, c.routeId); const ready = c.status === 'ready' || c.status === 'sample'; const qc = quote && quote.routeId === c.routeId && quote.runOn === r.id ? (quote.listCredits ?? quote.credits) : null; const price = listPrice(sc(typeof qc === 'number' && qc > 0 ? qc : c.credits), r.id, own); // this run's price on the route it quoted
    const pick = () => { if (busy || ownPick || !ready) return; void save(`${m.key}:${c.routeId}`, async () => { if (multi) setActiveModel(toolId, m.key); await setRoute(toolId, m.key, r.id, c.routeId); onClose(); }); };
    return <div key={`${m.key}:${c.routeId}`} role="radio" aria-checked={on} aria-disabled={!ready || undefined} tabIndex={ready ? 0 : -1} data-testid={`run-on-choice-${c.routeId}`} data-status={c.status}
      className={`ro-opt ro-choice${on ? ' on' : ''}${ready ? '' : ' dim'}`} onClick={pick} onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); pick(); } }}>
      <span className="ro-rad" aria-hidden /><span className="ro-ol">{c.word.charAt(0).toUpperCase() + c.word.slice(1)}</span>
      <span className="ro-op">{busy === `${m.key}:${c.routeId}` ? 'Saving…' : ready ? price ?? '' : <small>{STATUS_WORD[c.status] ?? 'Not available'}</small>}</span>
      <span className="ro-os">{[limitsText(c), c.why, !ready && c.reason ? String(c.reason).replace(/\.$/, '') : ''].filter(Boolean).join(' · ')}
        {c.reasonCode === 'route_not_enabled' && <> · <button type="button" className="ro-lnk" data-testid={`run-on-recheck-${c.routeId}`} disabled={!!busy} onClick={e => { e.stopPropagation(); void save(`recheck:${c.routeId}`, async () => {
          const r = await fetch(`/api/routing/route-off/${encodeURIComponent(c.routeId)}`, { method: 'DELETE' }); if (!r.ok) throw new Error('Couldn’t check again. Try in a moment.'); await fetch('/api/tools').then(x => (x.ok ? x.json() : null)).then(d => { if (Array.isArray(d)) noteToolModels(d); }).catch(() => undefined); requestRequote(); }); }}>Check again</button></>}</span></div>; };
  const actionEl = (m: ToolModel, r: RunOnRow) => { const a = r.action; if (!a || r.status === 'ready') return null;
    const stop = (e: React.MouseEvent) => e.stopPropagation();
    if (a.kind === 'turn_on') return <button type="button" className="ro-lnk" data-testid={`run-on-act-${r.id}`} disabled={!!busy} onClick={e => { stop(e); void turnOnGpu(); }}>{busy === 'gpu' ? 'Turning on…' : a.text}</button>;
    if (a.kind === 'download') return <button type="button" className="ro-lnk" data-testid={`run-on-act-${r.id}`} disabled={!!busy} onClick={e => { stop(e); download(m, r, a); }}>{a.text}</button>;
    const to = a.connection === 'deploy' ? '/settings#conn-deploy' : a.kind === 'add_key' ? `/settings#conn-${RUN_ON_BILLING[r.id] ?? r.id}` : '/settings#gpu';
    return <Link to={to} className="ro-lnk" data-testid={`run-on-act-${r.id}`} onClick={(e: any) => { stop(e); onClose(); }}>{a.text}</Link>; };
  const opt = ({ m, r, s }: { m: ToolModel; r: RunOnRow; s: ReturnType<typeof rowState> }) => {
    const ways = waysOf(r, ownPick); const on = !ways && isOn(m, r); const price = ways ? null /* each way has its own */ : listPrice(sc(rowCredits(r)), r.id, own); const ps = perShot(r.credits, r.id); const cc = r.id === 'local' ? null : priceDetail(null, { runOn: r.id, credits: sc(rowCredits(r)) }); // the hover: '135 Comfy credits · on your Creator plan'
    const act = actionEl(m, r);
    const sub = [detailOf(r, !!ways), ps ? `per shot ${ps}` : '', multi ? `Runs ${shownName(m)}` : '', r.id === 'comfy-cloud' && (r.comfyVariants?.length ?? 0) > 1 && !ways ? comfyVariantText(r, m.name, m.family) : '' /* the ways below name each one */, billsText(r), r.id === 'local' ? '' : rule(ruleOf(r))].filter(Boolean).join(' · ');
    const here = r.id === 'local' ? hereOf(m) : null; const mem = here ? memoryCheck(here.memGB, hw?.profile, live) : null;
    const mini = r.id === 'local' ? (here || hwName ? hereLine({ name: hwName || null, freeGB: here && (here.memGB ?? 0) >= HEAVY_GB ? freeForModelsGB(hw?.profile, live) : null, ...here }) : 'checked against your computer first') : '';
    const pick = () => { if (!busy) void choose(m, r.id); }; const hid = `ro-h-${m.key}-${r.id}`.replace(/[^\w-]/g, '-');
    const isDefault = curM.key === m.key && shownPlace === r.id && !saved && !ownPick;
    const radio = ways ? { id: hid } : { role: 'radio', 'aria-checked': on, tabIndex: 0, onClick: pick, onKeyDown: (e: React.KeyboardEvent) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); pick(); } } };
    return <div key={`${m.key}:${r.id}`} {...radio} data-testid={`run-on-opt-${r.id}`} data-status={r.status} className={`ro-opt${ways ? ' ro-place' : ''}${on ? ' on' : ''}${s.dim ? ' dim' : ''}`}>
      <span className={ways ? 'ro-rad ro-rad-none' : 'ro-rad'} aria-hidden /><span className="ro-ol">{rowPlaceLabel(r)}<em className={`ro-pill ro-${s.tone}`}>{s.word}</em>{isDefault && <em className="ro-pre" data-testid="run-on-preselected">Default</em>}</span>
      <span className="ro-op" title={cc ?? undefined}>{busy === `${m.key}:${r.id}` ? 'Saving…' : price ?? ''}{act && <small>{act}</small>}</span><span className="ro-os">{sub}{mini && <span className={`ro-here${mem?.short ? ' short' : ''}`} data-testid="run-on-here" title={mem?.short ? mem.text : undefined}>{sub ? ' · ' : ''}{mini}</span>}</span></div>; };
  return <BarPopover open={open} anchor={anchor} avoid={avoid} watch={watch} gap={gap} placement={placement} onClose={onClose} label={`Run ${multi ? toolName : shownName(model)} on`} role="dialog" className="apop-runon" testId="run-on-menu" width={360}>
    <div className="ro-pop" role="radiogroup" aria-label={`Where ${shownName(model)} runs`} aria-busy={!!busy || undefined}>
      <div className="ro-h">Run {multi ? toolName : shownName(model)} on<small>{scale ? `Prices are for the whole ${scale.unit}. ` : ''}{saved || ownPick ? `Remembered for ${ownPick?.rememberedFor ?? toolName}.` : rows.some(x => x.r.id === shownPlace && x.m.key === curM.key && (x.r.status === 'ready' || x.r.status === 'sample')) ? `The default is the first option that’s ready: Comfy Cloud, then your other keys, then your computer. Your pick is remembered for ${toolName}.` : `Nothing is ready yet, so the first one to set up is the default. Your pick is remembered for ${toolName}.`}</small></div>
      {GROUPS.map(g => { const rs = rows.filter(x => groupOf(x.r) === g.id); if (!rs.length) return null;
        return <div key={g.id} className="ro-g" role="group" aria-label={g.label} data-testid={`run-on-group-${g.id}`}><span className="ro-grp">{(() => { const Ic = placeIconFor(g.id); return <Ic size={12} className="ro-grp-ic" />; })()}{g.label}</span>{rs.map(x => { const ways = waysOf(x.r, ownPick); return ways ? <div key={`${x.m.key}:${x.r.id}`} className="ro-nest" role="group" aria-labelledby={`ro-h-${x.m.key}-${x.r.id}`.replace(/[^\w-]/g, '-')} data-testid={`run-on-ways-${x.r.id}`}>{opt(x)}{ways.map(c => choiceRow(x.m, x.r, c))}</div> : opt(x); })}</div>; })}
      {!rows.length && <p className="ro-off" data-testid="run-on-none">Nothing can run {shownName(model)} on this server yet.</p>}
      {err && <Notice as="p" kind="error" tone="line" className="ro-err" testId="run-on-error">{err}</Notice>}
      {saved && !ownPick && <button type="button" className="ro-reset" data-testid="run-on-reset" disabled={!!busy} onClick={() => void save('reset', async () => { await setRunOn(toolId, curM.key, ''); onClose(); })}>Use the default</button>}
    </div></BarPopover>;
}
