/**
 * Workflows database (2026-10-27): ONE indexed list of every recipe an agent or the app can browse, by name, description, tags and media.
 *  - workflow: every runnable workflow on the Workflows page (shared/workflowCatalog.ts WF_ENTRIES), one step each;
 *  - chain:    the multi-step chains (WF_CHAINS), their steps in order with the model each step ran on;
 *  - skill:    the ready-made agent skills (skills/<id>/SKILL.md), their flow and the tools they call (parsed on the server);
 *  - saved:    the user's own saved looks (a result's settings kept as a reusable recipe, server/src/workflowLooks.ts);
 *  - idea:     researched workflows that are NOT built (a private research file, see libraryDb.ts). Always `status: 'idea'`, never runnable,
 *              ranked under what the app really runs.
 * Data only: models, prices and the credited ComfyUI graph come from GET /api/tools on the server (libraryDb.ts enrich). Isomorphic.
 * Test: server/test/library-db.test.ts.
 */
import { WF_ENTRIES, WF_CHAINS, WF_CATS, wfEntryById, type WfEntry, type WfChain } from './workflowCatalog.js';
import { featuredByKey, runByJob } from './featured.js';
import { showcaseById } from './showcase.js';
import { Bm25Index, keywords, type SearchDoc } from './bm25.js';

export type Medium = 'text' | 'image' | 'video' | 'audio' | '3d';
export const MEDIA: Medium[] = ['text', 'image', 'video', 'audio', '3d'];
export type LibWorkflowKind = 'workflow' | 'chain' | 'skill' | 'saved' | 'idea';
export interface LibStep { /** a workflow id in this database (w-…), or null when the step is not one of ours */ id: string | null; name: string; say?: string | null; toolId?: string | null;
  /** the model the step is shown with (a model key on its tool, or a name) */ model?: string | null; /** the Canvas card workflow id (canvas_add_card / canvas_batch), null = no canvas card for it */ canvas?: string | null }
export interface LibModel { key: string; name: string; /** "Free · on your computer", "On Comfy Cloud · from $0.14", "Needs a fal key" */ where: string; priceUsd: number | null; free: boolean; default: boolean }
export interface LibExample { url: string; poster: string | null; prompt: string | null; model: string | null; place: string | null; costUsd: number | null; jobId: string | null }
export interface LibSource { kind: 'official' | 'community' | 'ours' | 'research'; name: string; url: string | null; author: string | null; licence: string | null }
export interface LibWorkflow {
  id: string; kind: LibWorkflowKind; name: string; description: string; /** the job to be done, in plain words */ job: string; tags: string[]; category: string | null;
  mediaIn: Medium[]; mediaOut: Medium[]; steps: LibStep[]; models: LibModel[]; examples: LibExample[];
  /** where it runs: app = open it in the app (href), skill = your AI agent runs it, idea = not built */
  runs: { where: 'app' | 'agent' | 'none'; href: string | null; toolId: string | null; runnable: boolean }; status: 'ready' | 'idea';
  source: LibSource | null; /** extra words for search (needs, how, model names) */ extra?: string;
}

/** Workflows page entry → its Canvas card workflow id (server/src/canvasAgent.ts canvasWorkflows; image recipes by their own id). */
const CANVAS_BY_SOURCE: Record<string, string> = { 'video:photos-to-reel': 'photos-to-reel', 'video:create': 'video', 'video:extend': 'extend', 'video:transitions': 'transition', 'video:upscale': 'video-upscale', 'video:lip-sync': 'lip-sync',
  'audio:music': 'music', 'audio:sfx': 'sfx', 'audio:voiceover': 'voice', '3d:image-to-3d': 'image-to-3d', 'image:create-image': 'create', 'image:edit-image': 'create' };
const CANVAS_IMAGE = new Set(['relight', 'upscale', 'remove-bg', 'image-layers', 'expand', 'product-shot', 'character-sheet', 'face-swap', 'person-swap', 'try-on']);
export const canvasIdOf = (e: WfEntry): string | null => CANVAS_BY_SOURCE[e.source] ?? (e.source.startsWith('image:') && CANVAS_IMAGE.has(e.source.slice(6)) ? e.source.slice(6) : null);
/** The database id of a Workflows page entry (w-v-create, w-i-relight…) and of a chain (c-presenter). */
export const wfId = (entryId: string) => `w-${entryId}`;
export const chainId = (id: string) => `c-${id}`;

/** Media a "needs" line takes ("1 clip + what to remove", "A photo", "Portrait + speech"). */
export function mediaOfNeeds(needs: string): Medium[] {
  const s = needs.toLowerCase(); const out = new Set<Medium>();
  if (/photo|image|picture|portrait|frame|sketch|product/.test(s)) out.add('image');
  if (/clip|video|footage/.test(s)) out.add('video');
  if (/audio|voice|speech|song|track|sound|recording/.test(s)) out.add('audio');
  if (/prompt|script|text|words|what to remove|lyrics/.test(s) || !out.size) out.add('text');
  return MEDIA.filter((m) => out.has(m));
}
const catLabel = (c: string) => WF_CATS.find((x) => x.id === c)?.label ?? c;

function exampleOfFeatured(key: string | undefined): LibExample[] {
  const f = key ? featuredByKey(key) : undefined; if (!f) return [];
  const run = f.jobId ? runByJob(f.jobId) : undefined;
  return [{ url: f.out.url, poster: f.out.poster ?? null, prompt: f.prompt || null, model: f.model, place: run?.place ?? (f.runOn === 'local' ? 'on our computer' : 'Comfy Cloud'), costUsd: run?.costUsd ?? f.costUsd ?? (f.runOn === 'local' ? 0 : null), jobId: f.jobId ?? null }];
}
function exampleOfShowcase(id: string | undefined): LibExample[] {
  const s = id ? showcaseById(id) : undefined; if (!s) return [];
  const run = runByJob(s.id);
  return [{ url: s.image, poster: s.thumb, prompt: s.prompt || null, model: s.model, place: run?.place ?? 'on our computer', costUsd: run?.costUsd ?? 0, jobId: run ? s.id : null }];
}

/** One Workflows page entry as a database row (models left for the server to fill from GET /api/tools). */
export function fromEntry(e: WfEntry): LibWorkflow {
  const how = (e.how ?? []).map(([h, b]) => `${h}. ${b}`).join(' ');
  return { id: wfId(e.id), kind: 'workflow', name: e.name, description: e.line, job: `${catLabel(e.cat)}: ${e.line}`, tags: [...new Set(e.tags)], category: catLabel(e.cat),
    mediaIn: mediaOfNeeds(e.needs), mediaOut: [e.medium], steps: [{ id: wfId(e.id), name: e.name, say: e.line, toolId: e.toolId, model: e.models[0] ?? null, canvas: canvasIdOf(e) }],
    models: [], examples: [...exampleOfFeatured(e.featured), ...exampleOfShowcase(e.showcase)], runs: { where: 'app', href: e.href, toolId: e.toolId, runnable: true }, status: 'ready',
    source: null, extra: [e.needs, how, e.preset ?? '', e.mode ?? ''].join(' ') };
}
export function fromChain(c: WfChain): LibWorkflow {
  const entries = c.steps.map((s) => wfEntryById(s.entry));
  const steps: LibStep[] = c.steps.map((s, i) => { const e = entries[i]; return { id: e ? wfId(e.id) : null, name: e?.name ?? s.entry, say: s.say, toolId: e?.toolId ?? null, model: s.model ?? s.modelName ?? null, canvas: e ? canvasIdOf(e) : null }; });
  const runs = c.steps.flatMap((s) => (s.jobs ?? []).map(runByJob)).filter((r): r is NonNullable<typeof r> => !!r);
  const ex = exampleOfFeatured(c.featured);
  if (ex[0] && runs.length) ex[0] = { ...ex[0], costUsd: Math.round(runs.reduce((a, r) => a + r.costUsd, 0) * 10000) / 10000, model: runs.map((r) => r.model).join(' → ') };
  const first = entries[0]; const last = entries[entries.length - 1];
  return { id: chainId(c.id), kind: 'chain', name: c.name, description: c.line, job: c.line, tags: [...new Set([...c.tags, 'multi-step'])], category: 'Multi-step',
    mediaIn: first ? mediaOfNeeds(first.needs) : ['text'], mediaOut: last ? [last.medium] : [], steps, models: [], examples: ex,
    runs: { where: 'app', href: first?.href ?? null, toolId: first?.toolId ?? null, runnable: true }, status: 'ready',
    source: c.source ? { kind: 'official', name: c.source.name, url: c.source.url, author: c.source.author, licence: c.source.licence } : { kind: 'ours', name: 'Imagination Is All You Need', url: null, author: null, licence: 'AGPL-3.0 (this repo)' },
    extra: [c.handoff, c.skill ? `skill ${c.skill}` : ''].join(' ') };
}
/** Every workflow and chain the app runs (the server adds skills, saved looks and ideas). */
export const catalogWorkflows = (): LibWorkflow[] => [...WF_ENTRIES.map(fromEntry), ...WF_CHAINS.map(fromChain)];

// ------------------------------------------------------------------ skills
/** A skill's SKILL.md → a row: front matter name + description, the Flow's bold step names, and the tools it calls in order. */
export function fromSkill(dir: string, md: string, entries: WfEntry[] = WF_ENTRIES): LibWorkflow | null {
  const fm = /^---\n([\s\S]*?)\n---/.exec(md); if (!fm) return null;
  const field = (k: string) => new RegExp(`^${k}:\\s*(.+)$`, 'm').exec(fm[1])?.[1]?.trim().replace(/^["']|["']$/g, '') ?? '';
  const name = field('name') || dir; const description = field('description'); if (!description) return null;
  const title = /^#\s+(.+)$/m.exec(md)?.[1]?.trim() ?? name;
  const flow = [...md.matchAll(/^\d+\.\s+\*\*([^*]+)\*\*/gm)].map((m) => m[1].replace(/[:.]$/, '').trim());
  const tools = [...new Set([...md.matchAll(/tool_id:\s*"([a-z0-9-]+)"/g)].map((m) => m[1]))];
  const steps: LibStep[] = tools.map((t) => { const e = entries.find((x) => x.toolId === t); return { id: e ? wfId(e.id) : null, name: e?.name ?? t, toolId: t, canvas: e ? canvasIdOf(e) : null }; });
  const first = description.split(/(?<=\.)\s/)[0];
  const media = (s: string): Medium[] => { const l = s.toLowerCase(); return MEDIA.filter((m) => m === 'text' ? /script|prompt|text|idea|brief/.test(l) : m === '3d' ? /\b3d\b/.test(l) : new RegExp(m === 'image' ? 'photo|image|picture|still' : m === 'video' ? 'video|clip|film|ad\\b' : 'audio|music|song|voice|sound').test(l)); };
  const outM = media(description).filter((m) => m !== 'text');
  return { id: `s-${dir}`, kind: 'skill', name: title, description: first, job: description, tags: [...new Set(['agent skill', ...dir.split('-').filter((w) => w.length > 2), ...keywords(description, 5)])], category: 'Agent skill',
    mediaIn: media(first).length ? media(first) : ['text'], mediaOut: outM.length ? outM : ['video'], steps, models: [], examples: [],
    runs: { where: 'agent', href: '/mcp', toolId: null, runnable: true }, status: 'ready',
    source: { kind: 'ours', name: `skills/${dir}/SKILL.md`, url: null, author: 'Imagination Is All You Need', licence: 'AGPL-3.0 (this repo)' }, extra: flow.join(' · ') };
}

// ------------------------------------------------------------------ researched ideas (never runnable)
const MED: Record<string, Medium> = { image: 'image', images: 'image', photo: 'image', picture: 'image', video: 'video', clip: 'video', audio: 'audio', music: 'audio', voice: 'audio', speech: 'audio', song: 'audio', '3d': '3d', mesh: '3d', glb: '3d', text: 'text', prompt: 'text', script: 'text', instruction: 'text' };
const medOf = (xs: unknown): Medium[] => { const out = new Set<Medium>(); for (const x of Array.isArray(xs) ? xs : []) for (const w of String(x).toLowerCase().split(/[^a-z0-9]+/)) if (MED[w]) out.add(MED[w]); return MEDIA.filter((m) => out.has(m)); };
/** One researched entry (research workflows.json shape: id, name, job, category, steps, inputs, outputs, models, runs_on, price_per_run,
 *  source_url, source_title, author, licence, we_have, fit_why) → an idea row. Unknown shapes return null. */
export function fromIdea(r: any): LibWorkflow | null {
  if (!r || typeof r !== 'object' || typeof r.id !== 'string' || typeof r.name !== 'string') return null;
  const s = (v: unknown) => (typeof v === 'string' ? v : '');
  const cat = s(r.category); const out = medOf(r.outputs); const inp = medOf(r.inputs);
  return { id: `i-${r.id}`, kind: 'idea', name: r.name, description: s(r.job) || r.name, job: s(r.job), tags: [...new Set(['idea', cat, ...(Array.isArray(r.runs_on) ? r.runs_on.map(String) : [])].filter(Boolean).map((x) => x.toLowerCase()))],
    category: 'Ideas, not built yet', mediaIn: inp.length ? inp : ['text'], mediaOut: out.length ? out : cat && MED[cat] ? [MED[cat]] : [],
    steps: (Array.isArray(r.steps) ? r.steps : []).slice(0, 12).map((x: unknown) => ({ id: null, name: String(x), toolId: null, canvas: null })),
    models: (Array.isArray(r.models) ? r.models : []).slice(0, 8).map((m: unknown, i: number) => ({ key: String(m).toLowerCase().replace(/[^a-z0-9.]+/g, '-'), name: String(m), where: s(r.price_per_run) || 'Not built here', priceUsd: null, free: false, default: i === 0 })),
    examples: [], runs: { where: 'none', href: null, toolId: null, runnable: false }, status: 'idea',
    source: { kind: 'research', name: s(r.source_title) || s(r.source_section) || 'Research', url: /^https?:\/\//.test(s(r.source_url)) ? s(r.source_url) : null, author: s(r.author) || null, licence: s(r.licence) || null },
    extra: [s(r.we_have), s(r.fit_why), s(r.source_section)].join(' ') };
}

// ------------------------------------------------------------------ index
const PRIOR: Record<LibWorkflowKind, number> = { workflow: 1, chain: 0.97, saved: 1, skill: 0.92, idea: 0.8 };
export const workflowDoc = (w: LibWorkflow): SearchDoc => ({ id: w.id, name: w.name, tags: [...w.tags, ...w.mediaOut, w.category ?? ''], text: `${w.description} ${w.job}`,
  body: [w.extra ?? '', ...w.steps.map((s) => `${s.name} ${s.say ?? ''}`), ...w.models.map((m) => m.name), ...w.mediaIn.map((m) => `${m} in`)].join(' '), prior: PRIOR[w.kind] });
export interface WorkflowQuery { q?: string; media?: string | null; kind?: string | null; status?: string | null; limit?: number; offset?: number }
/** Ranked search over a list: q (words), media (in or out), kind (comma list), status (ready | idea). */
export function searchWorkflows(list: LibWorkflow[], index: Bm25Index, o: WorkflowQuery): { total: number; items: (LibWorkflow & { score: number; partial: boolean })[] } {
  const byId = new Map(list.map((w) => [w.id, w])); const kinds = String(o.kind ?? '').split(',').map((x) => x.trim()).filter(Boolean); const media = String(o.media ?? '').toLowerCase().trim();
  const keep = (d: SearchDoc) => { const w = byId.get(d.id)!; return (!kinds.length || kinds.includes(w.kind)) && (!o.status || w.status === o.status) && (!media || (w.mediaIn as string[]).includes(media) || (w.mediaOut as string[]).includes(media)); };
  const hits = index.search(o.q ?? '', keep); const off = Math.max(0, o.offset ?? 0); const lim = Math.min(200, Math.max(1, o.limit ?? 20));
  return { total: hits.length, items: hits.slice(off, off + lim).map((h) => ({ ...byId.get(h.id)!, score: h.score, partial: h.partial })) };
}
export const buildWorkflowIndex = (list: LibWorkflow[]) => new Bm25Index(list.map(workflowDoc));
