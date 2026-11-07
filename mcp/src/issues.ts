/**
 * Validation issues for agents (audit 2026-11-07 #4): the app's 400 body lists issues [{code, field, message, allowed?}]. The agent gets every one of
 * them (a single one too), with the field name, the allowed ids (from the issue, the body, or the tool's own input options: the message uses labels,
 * e.g. "Pick a mode: Generate, Edit image…", while the field takes ids generate / edit) and one `next` step it can act on.
 */
export interface Issue { field: string | null; code: string | null; message: string; allowed?: string[]; next: string }
type ToolLike = { inputs?: { name: string; kind?: string; options?: (string | number)[]; required?: boolean }[] } | null | undefined;

/** One issue's next step: set the field to an allowed id, add a missing field, or fix it as the message says. */
export function nextFor(field: string | null, allowed: string[] | undefined, list: boolean, code: string | null, message: string): string {
  if (field && allowed?.length) {
    const v = list ? JSON.stringify([allowed[0]]) : JSON.stringify(allowed[0]);
    return `set fields.${field} to ${v}${allowed.length > 1 ? ` (allowed: ${allowed.slice(0, 12).join(', ')}${allowed.length > 12 ? ', …' : ''})` : ''}, then quote and run again.`;
  }
  if (field && /required|missing|needs?/i.test(`${code ?? ''} ${message}`)) return `add fields.${field} (describe lists what it takes), then quote and run again.`;
  if (field) return `fix fields.${field} as the message says, then quote and run again.`;
  return 'fix the request as the message says, then quote and run again.';
}

/** The issues of an app error body, each with field, allowed ids and next. [] when the body has none. */
export function issuesOf(body: any, tool?: ToolLike): Issue[] {
  const raw: any[] = Array.isArray(body?.issues) ? body.issues : [];
  const inputs = new Map((tool?.inputs ?? []).map((i) => [i.name, i]));
  return raw.map((i) => {
    const field = typeof i?.field === 'string' && i.field ? i.field : null; const input = field ? inputs.get(field) : undefined;
    const fromBody = Array.isArray(i?.allowed) ? i.allowed : field && field === body?.field && Array.isArray(body?.allowed) ? body.allowed : null;
    const allowed = (fromBody ?? input?.options ?? null)?.map(String);
    const code = typeof i?.code === 'string' ? i.code : null; const message = String(i?.message ?? body?.error ?? 'Invalid input');
    const list = input?.kind === 'list' || field === 'types';
    return { field, code, message, ...(allowed?.length ? { allowed } : {}), next: nextFor(field, allowed ?? undefined, list, code, message) };
  });
}
