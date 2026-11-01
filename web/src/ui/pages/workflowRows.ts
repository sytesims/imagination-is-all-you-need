import type { ToolInfo } from '../../api';
import type { HubCard } from '../../shared/looks';
import { usdToken } from '../../../../server/src/shared/priceText';
import { featuredByKey, featuredRuns, runByJob, isOurComputer, OUR_COMPUTER, type FeaturedRun } from '../../../../server/src/shared/featured';
import { showcaseById } from '../../../../server/src/shared/showcase';
import { featureById } from '../../../../server/src/shared/imageFeatures';
import { runLabel, runPlaces, canRun, type RunPlace, type Where } from '../../../../server/src/shared/runLabel';
import { cardThumb, cardBefore, type WfEntry } from '../../../../server/src/shared/workflowCatalog';
import { audioWorkflowCredit, type AudioWorkflowId } from '../../../../server/src/shared/audioWorkflows';
/**
 * Workflows page rows (2026-10-27, split out of Workflows.tsx so tests can run it): one catalogue entry plus what GET /api/tools says today
 * (models, where each runs and its price, credit, licence) and its example. Where / price words: shared/runLabel.ts (one helper for the card
 * line and the sheet's places). A workflow with no model that can run anywhere (only "can’t run on this computer" / "not ready yet" routes), or
 * whose tool or preset is gone, has no row: the page never shows what can't run. Test: server/test/workflows-page.test.ts.
 */
type Src = { source: 'official' | 'community' | 'ours'; name: string; url: string | null; author: string; licence?: string; file?: string };
type Media = { kind: 'clip'; src: string; poster: string; sound: boolean } | { kind: 'still'; src: string } | { kind: 'split'; before: string; after: string; bl: string; al: string }
  /* a real sound of ours: the card keeps our drawing (no picture of a sound ships yet), the sheet plays it */ | { kind: 'sound'; src: string } | { kind: 'art' };
export interface M { key: string; name: string; /** its best place, in words (the card line) */ run: RunPlace; /** every place, best first (the sheet) */ places: RunPlace[]; licence: { id: string; name: string } | null; raw: any }
export interface Row { e: WfEntry; /** runnable models (the lead first) */ models: M[]; /** the model the card names: the example's when there is one, else the lead's */ model: string | null;
  /** the card's one where-and-price line: the lead model's best place */ run: RunPlace;
  /** what our example cost (null: no recorded run) */ price: { text: string; free: boolean } | null; source: Src | null;
  licence: { id: string; name: string } | null; media: Media; made: boolean; runMs: number | null; exampleModel: string | null;
  /** the recorded runs behind the example, oldest first (empty: no example, or a picture with no recorded run) */ runs: FeaturedRun[];
  /** "Open in <tab>": the tab with the lead model picked (the model the card names) */ openHref: string;
  /** the card's own picture (workflowCatalog WF_CARD_THUMBS, a shipped file); null: the media's own poster or our drawing */ thumb: string | null;
  /** the same picture before the change (WF_CARD_BEFORE): the card fades from it to `thumb` on hover */ thumbBefore: string | null }
export type Hub = { workflows: HubCard[] } | null;

const isClip = (u?: string) => !!u && /\.mp4(\?|$)/.test(u);
const isSound = (u?: string) => !!u && /\.(mp3|wav|ogg|m4a|flac)(\?|$)/i.test(u);
/** A file that ships in the repo (web/public): examples and showcase media, never this install's own /files/… results. */
export const shipped = (u?: string | null) => !!u && /^\/(examples|showcase)\//.test(u);
const norm = (s: string | null | undefined) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
/** What runs cost, as the card shows it: Free when every run was local (or in the browser), else the billed total. */
export const runsPrice = (runs: FeaturedRun[]): { text: string; free: boolean } | null => {
  if (!runs.length) return null; const usd = runs.reduce((a, r) => a + r.costUsd, 0);
  return usd === 0 ? { text: runs.every((r) => isOurComputer(r.place)) ? runLabel({}).text /* "Free · on your computer" (shared/runLabel.ts) */ : 'Free', free: true } : { text: usdToken(usd, { approx: runs.some((r) => r.est) }), free: false };
};
export const runCost = (r: FeaturedRun) => r.costUsd === 0 ? 'free' : usdToken(r.costUsd, { approx: r.est });
const now = (m: M) => m.run.kind === 'free' || m.run.kind === 'cloud' || m.run.kind === 'sample';

/** The tool's runnable models for this entry, as GET /api/tools lists them (mode / image-feature engines / pins applied). */
/** The place the tab will pick by itself for this model (GET /api/tools models[].autoRunOn: the server's own pick for this setup, so "Use
 *  local ComfyUI" off means the cloud), when it can run there; else the model's best place. The card says what the tab will do. */
const autoPlace = (m: any, places: RunPlace[]): RunPlace | undefined => places.find((p) => p.id === m.autoRunOn && p.kind !== 'none');
function modelsOf(e: WfEntry, t: any, hub: Hub, w: Where): M[] {
  const all: any[] = t.models ?? []; const modes: Record<string, string[]> = t.app?.providerModes ?? {};
  let list = all;
  if (e.mode && Object.keys(modes).length) list = list.filter((m) => (m.engines ?? []).some((g: string) => (modes[g] ?? []).includes(e.mode!)));
  if (e.hubId) { const use = new Set<string>(hub?.workflows.find((x) => x.id === e.hubId)?.models ?? featureById(e.hubId)?.providers ?? []); const l = list.filter((m) => (m.engines ?? []).some((g: string) => use.has(g))); if (l.length) list = l; }
  const pinned = e.models.map((k) => all.find((m) => m.key === k)).filter(Boolean);
  list = e.modelsOnly && pinned.length ? pinned : [...pinned, ...list.filter((m) => !e.models.includes(m.key))];
  return list.filter(canRun).map((m) => { const places = runPlaces(m, w); const auto = autoPlace(m, places);
    return { key: m.key, name: m.displayName ?? m.name ?? m.key, run: auto ?? runLabel(m, w), places: auto ? [auto, ...places.filter((p) => p !== auto)] : places, licence: m.license ?? null, raw: m }; });
}

/** Why an entry has no row on this server (null: it has one). */
export function whyHidden(e: WfEntry, tools: ToolInfo[], hub: Hub = null): string | null {
  const t: any = tools.find((x) => x.id === e.toolId); if (!t) return 'not on this server';
  if (e.preset && !(t.presets ?? []).some((p: any) => p.id === e.preset)) return 'that effect is not offered here';
  if ((t.models ?? []).length && !modelsOf(e, t, hub, {}).length) return 'no model of it can run on this computer';
  /* a model workflow whose tool lists no model at all here (Try-On with open models only: its models are hosted) has nothing to open; an
   * in-app tool with no models (Direct a Shot's planner, Turntable) still runs */
  if (!(t.models ?? []).length && (e.models.length || e.hubId)) return 'no model of it can run on this computer';
  return null;
}

/** One catalogue entry with what the server says today. null = it can't run here (whyHidden says why). */
export function resolveRow(e: WfEntry, tools: ToolInfo[], hub: Hub, w: Where = {}): Row | null {
  if (whyHidden(e, tools, hub)) return null;
  const t: any = tools.find((x) => x.id === e.toolId)!; const models = modelsOf(e, t, hub, w);
  let media: Media = { kind: 'art' }; let made = false; let runMs: number | null = null; let exampleModel: string | null = null; let exampleKey: string | null = null; let runs: FeaturedRun[] = [];
  const f = e.featured ? featuredByKey(e.featured) : undefined; const s = !f && e.showcase ? showcaseById(e.showcase) : undefined;
  /* a hub example only when its files ship with the repo: a look's own result (/files/…) is this install's data, so a fresh clone (and anyone
   * else's install) would show a different picture or none; the card keeps our drawing until a shipped example exists */
  const hx = !f && !s && e.hubId ? hub?.workflows.find((x) => x.id === e.hubId)?.example : null;
  const ex = hx && (hx.kind === 'split' ? [hx.before, hx.after] : [hx.url]).every(shipped) ? hx : null;
  /* "Made here" only with a recorded run (a job id): a featured result's runs, a showcase image (its id is the job id), a hub example's own run */
  if (e.example) { const x = e.example; media = { kind: 'split', before: x.before, after: x.after, bl: x.beforeLabel, al: x.afterLabel }; runs = [x.run]; made = true; exampleModel = x.run.model; }
  else if (f) { media = isClip(f.out.url) ? { kind: 'clip', src: f.out.url, poster: f.out.poster, sound: !!f.out.sound } : isSound(f.out.url) ? { kind: 'sound', src: f.out.url } : { kind: 'still', src: f.out.url }; runs = featuredRuns(f); made = !!f.jobId; runMs = f.runMs ?? null; exampleModel = f.model; exampleKey = f.modelKey ?? null; }
  else if (e.listen && runByJob(e.listen.jobId)) { const r = runByJob(e.listen.jobId)!; media = { kind: 'sound', src: e.listen.url }; runs = [r]; made = true; exampleModel = r.model; }
  else if (s) { media = s.before ? { kind: 'split', before: s.before.crop?.before ?? s.before.thumb, after: s.before.crop?.after ?? s.thumb, bl: s.before.label, al: s.before.afterLabel } : { kind: 'still', src: s.thumb }; runs = [runByJob(s.id)].filter((r): r is FeaturedRun => !!r); made = runs.length > 0; runMs = s.runMs ?? null; exampleModel = s.model; }
  else if (ex) { media = ex.kind === 'split' ? { kind: 'split', before: ex.before, after: ex.after, bl: ex.beforeLabel, al: ex.afterLabel } : { kind: 'still', src: ex.url }; exampleModel = ex.model;
    if (ex.jobId && ex.model) { made = true; const local = ex.paid?.runOn === 'local'; runs = [{ jobId: ex.jobId, model: ex.model, place: local ? OUR_COMPUTER : 'cloud', costUsd: local ? 0 : ex.paid?.usd ?? (ex.paid?.credits != null ? ex.paid.credits / 100 : 0) }]; } }
  /* the lead (the card's line, the sheet's first model): the example's own model (the card names it, so the line is ITS place and price,
   * even when that is "Needs a key"), else the first pin that runs now, else a free model on this computer, else the first that runs now
   * (the tool's quality order), else the first that can after set-up */
  /* 2026-10-28 (picks audit): the example's model leads only when it runs here NOW (else a card promised "Needs an LTX key" while Open ran
   * something else); then a pinned model that runs now, a free one on this computer, any that runs now, the example's, the first. Cloud-only and
   * local-only setups each get a lead they can run, and Open passes that lead on (openHref), so the card and the tab always agree. */
  const ixAny = made ? models.findIndex((m) => (exampleKey && m.key === exampleKey) || norm(m.name) === norm(exampleModel)) : -1; const ix = ixAny >= 0 && now(models[ixAny]) ? ixAny : -1;
  const pin = models.findIndex((m) => e.models.includes(m.key) && now(m)); const free = models.findIndex((m) => m.run.kind === 'free'); const any = models.findIndex(now);
  const lead = [ix, pin, e.models.length ? -1 : free, any, ixAny, 0].find((i) => i >= 0) ?? 0; if (lead > 0) models.unshift(...models.splice(lead, 1));
  const shown = models[0]?.raw;
  const engines: string[] = shown?.engines ?? []; const provs: any[] = t.providers ?? [];
  /* the credit: an audio workflow's own graph per model (Cover is YuE2's cover template, not its song one), else the lead engine's recorded workflow */
  const aw = e.source.startsWith('audio:') ? audioWorkflowCredit(e.source.slice(6) as AudioWorkflowId, shown?.primaryEngine ?? engines[0] ?? '') : null;
  const wf = (aw ?? provs.find((p) => p.id === (shown?.primaryEngine ?? engines[0]))?.workflow ?? provs.find((p) => engines.includes(p.id) && p.workflow)?.workflow ?? null) as Src | null;
  /* a preset that runs in one place only (Footage Effects' Comfy Cloud effects): the card names its own model and that place, never the model's free local one */
  const pre: any = e.preset ? (t.presets ?? []).find((p: any) => p.id === e.preset) : null; const only = pre?.runOn ? models[0]?.places.find((p) => p.id === pre.runOn) : undefined;
  if (only && models[0]) models.splice(0, 1, { ...models[0], name: pre.modelName ?? models[0].name, run: only, places: [only], raw: { ...models[0].raw, runsOn: (models[0].raw?.runsOn ?? []).filter((x: any) => x.id === pre.runOn) } }); // its own model and its one place, on the card and the sheet
  const run = only ?? models[0]?.run ?? runLabel({}, w);
  /* the card names the model Open runs (the lead); the example's own model, when another, is said under the example in the sheet */
  const exampleLeads = made && exampleModel && models[0] && ((exampleKey && models[0].key === exampleKey) || norm(models[0].name) === norm(exampleModel) || models[0].name === e.name || models[0].name === e.tabName /* Direct a Shot: the tool's one model is the workflow (the page calls it Plan a shot in 3D) */);
  const model = exampleLeads ? exampleModel : only && pre.modelName ? pre.modelName : models[0]?.name ?? exampleModel;
  return { e, models, model, run, price: made ? runsPrice(runs) : null, source: (only && pre.source) || wf /* the official template it runs */, licence: models[0]?.licence ?? null, media, made, runMs, exampleModel, runs,
    openHref: openHrefOf(e, models), thumb: cardThumb(e.id), thumbBefore: cardBefore(e.id) };
}
/** The tab link with the lead model (?model=<key>): what the card names is what opens. A tool with one model (Direct a Shot) or a one-place
 *  preset (Footage Effects) keeps its own link. */
export function openHrefOf(e: WfEntry, models: M[]): string {
  const k = models[0]?.key; if (!k || models.length < 2 || e.preset) return e.href;
  const [p, q = ''] = e.href.split('?'); const u = new URLSearchParams(q); u.set('model', k); return `${p}?${u}`;
}
