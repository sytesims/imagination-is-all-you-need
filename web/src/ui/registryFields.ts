import type { ToolInfo } from '../api';
/**
 * The ONE place that maps tool-registry fields to nav/UI concepts.
 * Registry: `category` (alias `group`), `status` (omitted = stable, 'new', 'soon' for /api/roadmap), `previewUrl`.
 */
const CATEGORY_FIELD = 'category';
const STATUS_FIELD = 'status';
/** Status values that get no pill. 'new' gets the small New badge instead (isNew). */
const QUIET_STATUSES = ['live', 'stable', 'ga', 'new', ''];
export const categoryOf = (t: ToolInfo): string => (t as any)[CATEGORY_FIELD] ?? t.group ?? 'Tools';
const rawStatus = (t: ToolInfo) => String((t as any)[STATUS_FIELD] ?? '').toLowerCase();
export const statusOf = (t: ToolInfo): string | undefined => { const s = rawStatus(t); return s && !QUIET_STATUSES.includes(s) ? s : undefined; };
export const isNew = (t: ToolInfo) => rawStatus(t) === 'new';
export const previewOf = (t: ToolInfo): string | null => (t as any).previewUrl ?? null;
export function groupTools(tools: ToolInfo[]): [string, ToolInfo[]][] {
  const m = new Map<string, ToolInfo[]>();
  tools.forEach(t => { const g = categoryOf(t); m.set(g, [...(m.get(g) ?? []), t]); });
  return [...m.entries()];
}
