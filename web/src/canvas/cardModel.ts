/**
 * The generate card's data, as plain functions (no tldraw, no React, no CSS), so the card, the run code, the agent API and the node test
 * (server/test/canvas-generate.e2e.ts) share one definition:
 *  - GenCardProps: everything a card keeps in the board snapshot (settings, inputs as /files/ URLs, job id, takes, parents). Never media data.
 *  - draftProps: a new draft (nothing runs until Generate).
 *  - runForm: the exact form fields and files a run sends (from the shared flow spec), before any file is fetched.
 *  - takesOf: a finished job's outputs as takes. runningCards: the cards a reopened board must follow again.
 */
import type { JobState } from '../api';
import type { FlowSpec, GenMedium, InputKind } from '../shared/genFlows';
import { DEFAULT_FLOW, flowById } from '../shared/genFlows';
import { resultKindOfUrl, videoPoster, type ResultKind } from '../shared/mediaKind';
import { jobIs3d, posterOf3d } from '../shared/model3d';
import { GEN_TYPE } from './nodeTypes';
import type { TakeReview } from '../../../server/src/shared/takeReview';

export { GEN_TYPE } from './nodeTypes';
export interface Take { url: string; poster: string; kind: ResultKind; jobId: string; out: number; /** the agent's look at this version (shared/takeReview.ts); never decides which one is active */ review?: TakeReview;
  /** a demo sample's own line ("Sample · made with LTX-2.5 22B"): the card shows it instead of the card's model */ made?: string }
export interface BoardInput { key: string; kind: InputKind; url: string; poster: string; jobId: string; /** the shape it comes from (arrow inputs) */ shapeId?: string; /** the arrow that binds it */ arrowId?: string; label: string }
export type CardStatus = 'draft' | 'running' | 'done' | 'failed';
export interface GenCardProps {
  w: number; h: number; medium: GenMedium; flow: string; provider: string; prompt: string; vals: Record<string, string>;
  /** files added on the card (uploaded: /files/ URLs) */ inputs: BoardInput[]; /** input key → the slot it was put in */ pins: Record<string, string>;
  status: CardStatus; jobId: string; error: string; takes: Take[]; take: number;
  /** lineage: the shapes this card ran from (inputs), or was made from (a quick action's source) */ parents: string[];
  /** the model's shown name and maker as last run (the card draws a finished run without a request) */ model: string; maker: string;
  /** the quote the last run was priced at (compact; GenPrice reads it) */ quote: any; runs: number; /** width / height of the result (0 = unknown) */ ratio: number;
}
export const CARD_W = 340;
/** A card's height: the title, a picture box, the model · place · price row, two lines of prompt and the footer (2026-10-27; was 330). */
export const CARD_H = 430;
export function draftProps(o: { flow?: string; medium?: GenMedium; provider?: string; prompt?: string; vals?: Record<string, string>; parents?: string[] } = {}): GenCardProps {
  const f = flowById(o.flow ?? '') ?? flowById(DEFAULT_FLOW[o.medium ?? 'image'])!;
  return { w: CARD_W, h: CARD_H, medium: f.medium, flow: f.id, provider: o.provider ?? f.provider ?? '', prompt: o.prompt ?? '', vals: o.vals ?? {}, inputs: [], pins: {}, status: 'draft', jobId: '', error: '', takes: [], take: 0,
    parents: o.parents ?? [], model: '', maker: '', quote: null, runs: 0, ratio: 0 };
}

/** The price a run was quoted at, kept small on the card (GenPrice reads exactly these fields). */
export function compactQuote(q: any): any {
  if (!q || typeof q !== 'object') return null;
  const c = q.cost && typeof q.cost === 'object' ? { billedTo: q.cost.billedTo, billedToName: q.cost.billedToName, estUsd: q.cost.estUsd, estUnits: q.cost.estUnits, unitLabel: q.cost.unitLabel, checkedAt: q.cost.checkedAt ?? null, plan: q.cost.plan ?? null, estimated: q.cost.estimated, demo: q.cost.demo, failureNote: q.cost.failureNote, realRunUsd: q.cost.realRunUsd } : null;
  return JSON.parse(JSON.stringify({ credits: q.credits ?? null, demo: q.demo === true, localRun: q.localRun === true, needsKey: q.needsKey === true, runnable: q.runnable !== false, priceAvailable: q.priceAvailable, chargeable: q.chargeable, routeKind: q.routeKind ?? null, ...(c ? { cost: c } : {}) })); /* JSON only: tldraw's json props refuse undefined */
}

/** A finished job's outputs as takes (one per output: 4 images, the layers of a split, one clip). */
export function takesOf(j: JobState): Take[] {
  const is3d = jobIs3d(j); const outs = (j.outputs ?? []).filter(o => o?.url); const list = outs.length ? outs : j.resultUrl ? [{ label: '', url: j.resultUrl }] : [];
  return list.map((o: any, i) => { const kind: ResultKind | null = is3d ? '3d' : resultKindOfUrl(o.url); if (!kind) return null;
    const poster = kind === 'image' ? o.url : kind === 'video' ? (o.posterUrl ?? videoPoster(o.url, i === 0 ? j : undefined)) : kind === '3d' ? posterOf3d(j) ?? '' : '';
    return { url: o.url, poster, kind, jobId: j.id, out: i, ...(typeof o.madeWith === 'string' && o.madeWith ? { made: o.madeWith } : {}) }; }).filter(Boolean) as Take[];
}

/** The form a run sends: fields (types, settings, prompt, model, seed, project, board, parent) and which input goes out as which field.
 *  Files are listed, not fetched: the caller turns each URL into a File. */
export function runForm(spec: FlowSpec, bySlot: Record<string, BoardInput[]>, inputs: BoardInput[], prompt: string, ctx: { projectId: string | null; boardId: string; route?: string | null; seed?: number }) {
  const fields: Record<string, string> = {};
  for (const [k, v] of Object.entries(spec.fields)) if (v !== '' && v != null) fields[k] = v;
  if (spec.promptMode !== 'hidden') fields.prompt = prompt;
  fields.seed = String(ctx.seed ?? Math.floor(Math.random() * 1e6));
  if (spec.provider) { fields.provider = spec.provider; if (ctx.route) fields.route = ctx.route; }
  fields.projectId = ctx.projectId ?? ''; /* '' = the board has no project: createJob then leaves the feed's project out */ fields.boardId = ctx.boardId;
  const parent = inputs.find(i => i.jobId)?.jobId; if (parent) fields.parentId = parent;
  const files: { field: string; input: BoardInput; name: string }[] = [];
  for (const s of spec.slots) (bySlot[s.name] ?? []).forEach((inp, i) => files.push({ field: i > 0 && s.restAs ? s.restAs : s.sendsAs, input: inp, name: `${s.name}-${i + 1}` }));
  return { fields, files };
}

/** The most versions a card keeps (the oldest drop off; Pull out keeps one as its own card). */
export const MAX_VERSIONS = 24;
/** The card's versions after a run: the old ones, then the new ones (a URL already on the card is not added twice), capped; the first new one is active. */
export function addVersions(old: Take[], fresh: Take[]): { takes: Take[]; take: number } {
  const seen = new Set(old.map(t => t.url)); const add = fresh.filter(t => !seen.has(t.url)); if (!add.length) { const i = old.findIndex(t => t.url === fresh[0]?.url); return { takes: old, take: Math.max(0, i) }; }
  const all = [...old, ...add]; const cut = Math.max(0, all.length - MAX_VERSIONS); return { takes: all.slice(cut), take: Math.max(0, old.length - cut) };
}

/** Cards in a saved board document that were running: a reopened board follows these jobs again. */
export function runningCards(doc: { store?: Record<string, any> } | null | undefined): { shapeId: string; jobId: string }[] {
  return Object.values(doc?.store ?? {}).filter((r: any) => r?.typeName === 'shape' && r.type === GEN_TYPE && r.props?.status === 'running' && r.props?.jobId).map((r: any) => ({ shapeId: r.id, jobId: r.props.jobId }));
}
