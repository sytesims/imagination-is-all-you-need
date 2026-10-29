import { randomUUID } from 'node:crypto';
import { all, del, put } from './db.js';
/**
 * Assets library state (walkthrough: Assets · Projects · Favourites · Elements · Trash). In memory, local.
 * - favourite flag, project assignment and soft-delete (Trash, restorable) per job
 * - projects: named groups
 * - elements: saved reusable references (image + name + kind) usable as @ references in any tool
 * Persisted in SQLite (tables job_meta, projects, elements), write-through.
 */
export interface JobMeta { favourite: boolean; projectId: string | null; deletedAt: number | null; /** [R45] share link token (null = private). */ shareToken?: string | null; /** Legacy (reporting removed 2026-10-17): kept so old rows still parse. */ report?: { reason: string; note?: string | null; at: number; status: 'pending' | 'removed' | 'restored' } | null; /** Opt-in public gallery. */ published?: { at: number; showPrompt: boolean } | null; /** Community seed: someone else's result (author ≠ 'you'). */ author?: string; /** Legacy seeded like count (made up, ignored since round 1). */ likes?: number; /** Round 1: real local likes, one per browser (X-Client-Id) on this install. */ likedBy?: string[];
  /** Community seed: false = not a generation (example media or a credited sample clip); absent = a real result (true). */ aiGenerated?: boolean; /** Visible credit for third-party sample media, e.g. 'Sample · CC-BY Blender Foundation'. */ sampleCredit?: string | null; /** Display title (seeds). */ title?: string;
  /** Compare models (Create Image toolbar): this job is model i (0-based) of n in comparison group id; the feed shows the group side by side. */ compare?: { id: string; n: number; i: number } | null;
  /** Featured (2026-10-26): when it was starred with "Feature this" (null = not featured). Featured results show on an empty tab and under the Featured chip. */ featured?: number | null;
  /** Audio: the bean's dance style, heard in the browser (YAMNet) and/or picked from the style chip (danceStyle.ts). */ danceStyle?: import('./danceStyle.js').DanceStyle | null }
export interface Project { id: string; name: string; createdAt: number; parentId?: string | null }
export interface Element { id: string; name: string; kind: 'character' | 'product' | 'location' | 'other'; url: string; createdAt: number; fromJobId?: string | null;
  /** The cover is AI-generated (a saved result, or an AI sample still); absent on old rows → derived from fromJobId. */ aiGenerated?: boolean; /** Credit line for sample art, e.g. 'AI-generated sample · Imagination Is All You Need'. */ credit?: string | null;
  /** B2: every image of the element, first = `url` (the cover). Absent on elements saved before B2 (treat as [url]). */ images?: string[]; /** B1/B2 provenance per image (same order as images). */ sources?: ({ jobId: string; output: number; t: number | null } | null)[]; updatedAt?: number }

const meta = new Map<string, JobMeta>(all<JobMeta & { id: string }>('job_meta').map(({ id, ...m }) => [id, m]));
const projects = new Map<string, Project>(all<Project>('projects').map((p) => [p.id, p]));
const elements = new Map<string, Element>(all<Element>('elements').map((e) => [e.id, e]));

export const metaOf = (id: string): JobMeta => meta.get(id) ?? { favourite: false, projectId: null, deletedAt: null };
const upd = (id: string, p: Partial<JobMeta>) => { const m = { ...metaOf(id), ...p }; meta.set(id, m); put('job_meta', id, { id, ...m }); return m; };
export const setFavourite = (id: string, on: boolean) => upd(id, { favourite: on });
export const setFeatured = (id: string, on: boolean) => upd(id, { featured: on ? (metaOf(id).featured || Date.now()) : null });
export const isFeatured = (id: string) => !!metaOf(id).featured;
export const setProject = (id: string, projectId: string | null) => upd(id, { projectId });
export const setCompare = (id: string, compare: JobMeta['compare']) => upd(id, { compare });
export const setDanceStyle = (id: string, danceStyle: JobMeta['danceStyle']) => upd(id, { danceStyle });
/** Soft delete also revokes the share link; restore does not bring it back. */
export const trash = (id: string) => { for (const f of trashHooks) { try { f(id); } catch { /* best effort */ } } return upd(id, { deletedAt: Date.now(), shareToken: null, published: null }); };
/** Run when a job goes to Trash (shareExport.ts removes its branded video exports). */
export const trashHooks: ((id: string) => void)[] = [];
export const restore = (id: string) => upd(id, { deletedAt: null });

export const listProjects = () => [...projects.values()].sort((a, b) => a.createdAt - b.createdAt);
export const getProject = (id: string) => projects.get(id);
export function createProject(name: string) { const p = { id: randomUUID().slice(0, 8), name: name.trim().slice(0, 80) || 'Untitled project', createdAt: Date.now() }; projects.set(p.id, p); put('projects', p.id, p); return p; }
export function renameProject(id: string, name: string) { const p = projects.get(id); if (!p) return null; const n = { ...p, name: name.trim().slice(0, 80) }; projects.set(id, n); put('projects', id, n); return n; }
/** Subfolders: move a project under another (null = top level). Refuses a cycle. */
export function moveProject(id: string, parentId: string | null): Project | { error: string } {
  const p = projects.get(id); if (!p) return { error: 'project not found' };
  if (parentId) { if (!projects.has(parentId)) return { error: 'parent project not found' }; for (let c: string | null | undefined = parentId; c; c = projects.get(c)?.parentId) if (c === id) return { error: 'a project cannot be inside itself' }; }
  const n = { ...p, parentId: parentId || null }; projects.set(id, n); put('projects', id, n); return n;
}
export function deleteProject(id: string) { for (const c of projects.values()) if (c.parentId === id) { const n = { ...c, parentId: projects.get(id)?.parentId ?? null }; projects.set(c.id, n); put('projects', c.id, n); } projects.delete(id); del('projects', id); for (const [k, m] of meta) if (m.projectId === id) upd(k, { projectId: null }); }

/** API shape: aiGenerated always a boolean (stored flag, else true when saved from a generated result), credit string|null. */
export const pubElement = (e: Element) => ({ ...e, aiGenerated: e.aiGenerated ?? !!e.fromJobId, credit: e.credit ?? null });
export const listElements = () => [...elements.values()].sort((a, b) => b.createdAt - a.createdAt);
export function addElement(e: Omit<Element, 'id' | 'createdAt'>) { const el = { ...e, id: randomUUID().slice(0, 8), createdAt: Date.now() }; elements.set(el.id, el); put('elements', el.id, el); return el; }
/** B2: append an image to an element (max 12). Returns the updated element, null if unknown, or {error} when full. */
export function addElementImage(id: string, url: string, source: { jobId: string; output: number; t: number | null } | null = null): Element | null | { error: string } {
  const e = elements.get(id); if (!e) return null; const images = e.images?.length ? [...e.images] : [e.url]; const sources = e.sources?.length === images.length ? [...e.sources] : images.map((_, i) => (i === 0 && e.fromJobId ? { jobId: e.fromJobId, output: 0, t: null } : null));
  if (images.length >= 12) return { error: 'An element holds at most 12 images.' };
  images.push(url); sources.push(source); const n = { ...e, images, sources, updatedAt: Date.now() }; elements.set(id, n); put('elements', id, n); return n;
}
export const getElement = (id: string) => elements.get(id);
export const deleteElement = (id: string) => { del('elements', id); return elements.delete(id); };
export const ELEMENT_KINDS = ['character', 'product', 'location', 'other'] as const;

/** [R45] Share tokens: private by default; share creates a random token for /s/:token, revoke clears it. */
export const shareJob = (id: string) => { const cur = metaOf(id).shareToken; return cur ? metaOf(id) : upd(id, { shareToken: randomUUID().replace(/-/g, '').slice(0, 16) }); };
export const unshareJob = (id: string) => upd(id, { shareToken: null });
export const jobByToken = (t: string) => [...meta.entries()].find(([, m]) => m.shareToken && m.shareToken === t)?.[0] ?? null;
/** Community seed metadata: author (≠ 'you') and the publish time. Likes are never seeded: they start at 0 and only count real clicks. */
export const setCommunityMeta = (id: string, p: { author: string; publishedAt?: number; showPrompt?: boolean; aiGenerated: boolean; sampleCredit?: string | null; title?: string }) =>
  upd(id, { author: p.author, published: { at: p.publishedAt ?? Date.now(), showPrompt: p.showPrompt ?? true }, aiGenerated: p.aiGenerated, sampleCredit: p.sampleCredit ?? null, ...(p.title ? { title: p.title } : {}) });
/** Seed migration: rewrite a seed's display fields in place (keeps likes, publish time, trash state; never called for real user jobs). */
export const fixSeedMeta = (id: string, p: { author: string; aiGenerated: boolean; sampleCredit: string | null; title?: string; showPrompt?: boolean }) => { const m = metaOf(id);
  return upd(id, { author: p.author, aiGenerated: p.aiGenerated, sampleCredit: p.sampleCredit, title: p.title, ...(m.published && p.showPrompt != null ? { published: { ...m.published, showPrompt: p.showPrompt } } : {}) }); };
export const publishJob = (id: string, showPrompt: boolean) => upd(id, { published: { at: Date.now(), showPrompt } });
export const unpublishJob = (id: string) => upd(id, { published: null });

/** Round 1: real local likes. The count is the number of browsers on this install that liked it (X-Client-Id); a legacy seeded `likes` number is ignored. */
export const likesOf = (id: string): number => metaOf(id).likedBy?.length ?? 0;
export const likedBy = (id: string, client: string): boolean => !!client && (metaOf(id).likedBy ?? []).includes(client);
export const setLike = (id: string, client: string, on: boolean) => { const cur = metaOf(id).likedBy ?? []; const has = cur.includes(client);
  if (on === has) return metaOf(id); return upd(id, { likedBy: on ? [...cur, client].slice(-10_000) : cur.filter((c) => c !== client) }); };

/** Delete forever: drop the meta row. */
export const forget = (id: string) => { meta.delete(id); del('job_meta', id); };
