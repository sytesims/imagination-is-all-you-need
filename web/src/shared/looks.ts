/**
 * Workflows pages (2026-10-23): the client side of server/src/workflowLooks.ts. Fetchers, the words for a price (always the server's own quote
 * or what a run was charged, never a made-up number) and the Create bar links a look opens (shared presetLink: ?workflow=&preset=).
 */
import { runPrice, fmtUsd, placeOfQuote, ledgerUsd } from './billing';
import { unpricedReason } from './quote';
import { presetHref } from '../../../server/src/shared/presetLink';
import { resetImagePresets } from './imagePresets';
import { READY_WORKFLOW_TOOLS } from './workflowLinks';
import { LOCAL_FREE } from '../../../server/src/shared/modelIds';

export type Paid = { credits: number | null; usd: number | null; runOn: string | null } | null;
/** `jobId`: the run that made it (absent for a repo picture with no recorded run); `paid`: what that run cost */
export interface HubExample { kind: 'split'; before: string; after: string; beforeLabel: string; afterLabel: string; model: string | null; jobId?: string | null; paid?: Paid }
export interface HubSingle { kind: 'single'; url: string; model: string | null; jobId?: string | null; paid?: Paid }
export interface HubCard { id: string; name: string; tagline: string; needs: string; toolId: string; intents: string[]; models: string[]; looks: number; example: HubExample | HubSingle | null; href: string; createHref: string }
export interface Quote { [k: string]: any }
export interface LookTile { id: string; kind: 'preset' | 'mine'; name: string; description: string; href: string; createdAt: number | null; provider: string | null; modelName: string | null;
  cover: { url: string; /** the photo it started from (a before / after) */ inputUrl?: string | null; provider: string | null; modelName: string | null; paid: Paid }; models: number }
export interface HowItWorks { note: string | null; source: { kind: string; author: string; url: string | null; licence: string; file: string | null } | null;
  models: { provider: string; name: string; workflow: { line: string; source: string; name: string; url: string | null; author: string; licence: string; file: string | null } | null }[] }
export interface WorkflowDetail { workflow: { id: string; name: string; tagline: string; needs: string; toolId: string; intents: string[]; photo: boolean; createHref: string; example: HubExample | HubSingle | null; howItWorks: HowItWorks };
  looks: LookTile[]; best: { provider: string; name: string; quote: Quote | null }[] }
export interface Example { url: string; inputUrl: string | null; provider: string | null; modelName: string | null; jobId: string | null; paid: Paid; renderMs: number | null; at: number }
export interface LookDetail { workflow: { id: string; name: string; toolId: string; promptMode: string; fields: string[] };
  look: { id: string; kind: 'preset' | 'mine'; name: string; description: string; prompt: string; promptTemplate: string; subjectHint: string; settings: Record<string, string | number | string[]>; provider: string | null; modelName: string | null; href: string; createdAt: number | null };
  results: { provider: string | null; modelName: string | null; made: boolean; runs: number; latest: Example; compatible: boolean }[];
  untested: { provider: string; modelName: string; made: boolean; quote: Quote | null }[] }

const getJson = async <T,>(url: string): Promise<T> => { const r = await fetch(url); if (!r.ok) { const b = await r.json().catch(() => null); throw Object.assign(new Error(b?.error ?? `HTTP ${r.status}`), { status: r.status }); } return r.json(); };
export const loadHub = () => getJson<{ intents: { id: string; label: string }[]; workflows: HubCard[] }>('/api/workflow-hub');
export const loadWorkflow = (id: string) => getJson<WorkflowDetail>(`/api/workflow-hub/${encodeURIComponent(id)}`);
export const loadLook = (id: string, lookId: string) => getJson<LookDetail>(`/api/workflow-hub/${encodeURIComponent(id)}/looks/${encodeURIComponent(lookId)}`);

async function send(url: string, method: string, body?: unknown) {
  const r = await fetch(url, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const b = await r.json().catch(() => null); if (!r.ok) throw new Error(b?.error ?? `HTTP ${r.status}`); resetImagePresets(); notifyLooks(); return b;
}
export const saveLook = (jobId: string, name: string, output = 0) => send('/api/user-looks', 'POST', { jobId, name, output });
export const renameLook = (id: string, name: string) => send(`/api/user-looks/${encodeURIComponent(id)}`, 'PATCH', { name });
export const deleteLook = (id: string) => send(`/api/user-looks/${encodeURIComponent(id)}`, 'DELETE');
/** Pages listening for a saved / renamed / deleted look reload. */
const bus = new Set<() => void>(); export const onLooksChanged = (f: () => void) => { bus.add(f); return () => { bus.delete(f); }; }; const notifyLooks = () => bus.forEach(f => f());

/** What a run was charged, in the app's words ("Free · this computer", "≈ $0.07"). */
export function paidText(p: Paid, own: boolean | null): string | null {
  if (!p) return null; if (p.runOn === 'local') return runPrice({ own, runOn: 'local' });
  if (p.usd != null) return runPrice({ own, usd: p.usd, credits: p.credits, runOn: p.runOn });
  return runPrice({ own, credits: p.credits, runOn: p.runOn });
}
/** A quote in words: the price, or the reason it can't be priced or run (a key, a download), as the model menu says it. */
export function quoteText(q: Quote | null | undefined, own: boolean | null): { price: string | null; reason: string | null; sample: boolean } {
  if (!q) return { price: null, reason: 'Price unknown', sample: false };
  const why = unpricedReason(q); if (why) return { price: null, reason: why.replace(/\.$/, ''), sample: false };
  if (q.runnable === false) return { price: null, reason: String(q.unavailableReason ?? q.error ?? q.message ?? 'Can’t run here yet').replace(/\.$/, ''), sample: false };
  if (q.needsKey === true) return { price: null, reason: q.keyOwner ? `Needs a ${q.keyOwner} key` : 'Needs a key', sample: false };
  if (q.demo === true) return { price: 'Sample · free', reason: null, sample: true };
  return { price: runPrice({ own, credits: typeof q.credits === 'number' ? q.credits : null, runOn: q.local ? 'local' : placeOfQuote(q) }), reason: null, sample: false };
}
/** The cheapest price a workflow starts at, from the tool's models (the registry's fromPrice = its cheapest ready place, 0 locally). */
export function fromPriceText(tool: any, models: string[], own: boolean | null): string | null {
  let best: { credits: number; local: boolean } | null = null;
  for (const m of (tool?.models ?? []) as any[]) { if (!(m.engines ?? []).some((e: string) => models.includes(e)) || typeof m.fromPrice !== 'number') continue;
    const local = m.fromPrice === 0 && (m.runsOn ?? []).some((r: any) => r.id === 'local' && r.status === 'ready');
    if (!best || m.fromPrice < best.credits || (m.fromPrice === best.credits && local)) best = { credits: m.fromPrice, local }; }
  if (!best) return null; if (best.local) return own === false ? 'Free' : LOCAL_FREE;
  if (best.credits === 0) return 'Free';
  return `from ${ledgerUsd(best.credits)}`;
}
/** The Create bar with a look: its workflow, prompt (as edited here), settings and the model picked. Nothing runs until Generate. */
export function lookUseHref(workflow: string, lookId: string, o: { model?: string | null; prompt?: string | null; original?: string } = {}): string {
  const h = presetHref({ id: lookId, workflow }); const q = new URLSearchParams();
  if (o.model) q.set('lookModel', o.model); if (o.prompt != null && o.prompt !== o.original) q.set('lookPrompt', o.prompt);
  const s = q.toString(); return s ? `${h}&${s}` : h;
}
/** Can this result become a look? A finished image from an image workflow that isn’t a keyless demo preview. The server checks again (a mock / sample run is refused there with its reason). */
export function canSaveLook(j: any): boolean {
  if (!j || j.status !== 'done' || j.demo === true || j.routing?.demo || j.deletedAt) return false;
  const u = j.outputs?.[0]?.url ?? j.resultUrl; if (!u || !/\.(png|jpe?g|webp|gif)(\?|$)/i.test(u)) return false;
  return j.toolId === 'create-image' || j.toolId === 'soul' || j.toolId in READY_WORKFLOW_TOOLS;
}
/** A name to start from: the first words of the prompt ("Lighthouse at dusk"), else the workflow's name. */
export function lookNameFrom(prompt: string | null | undefined, fallback: string): string {
  const t = String(prompt ?? '').replace(/@\w+/g, '').replace(/\s+/g, ' ').trim(); if (!t) return fallback;
  const first = t.split(/[,.;:\n]/)[0].trim(); const words = first.split(' ').slice(0, 6).join(' ');
  const n = words.length > 48 ? `${words.slice(0, 47).trimEnd()}…` : words; return n.charAt(0).toUpperCase() + n.slice(1);
}
