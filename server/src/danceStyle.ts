/** The audio player's dance style on a job's meta (POST /api/jobs/:id/dance-style): what the browser heard the track as (YAMNet, run in the
 *  page: web/src/shared/heardStyle.ts) and/or the user's pick from the style chip. Small and validated: a pack id, a label, a confidence,
 *  the top classes and group strengths. Kept so every card and the viewer know it, and the track is never listened to twice. */
export const DANCE_PACKS = ['rap', 'love', 'rock', 'edm', 'lofi', 'classical', 'peaceful', 'voice', 'sfx', 'groove'] as const;
/** Old pack ids a page or a saved meta may still send: the peaceful pack was 'sad' until 2026-10-25. */
export const LEGACY_DANCE_PACKS: Record<string, DancePack> = { sad: 'peaceful' };
export type DancePack = (typeof DANCE_PACKS)[number];
export type DanceHeard = { pack: DancePack | null; label: string; conf: number; top: { c: string; s: number }[]; groups: Record<string, number>; scores: Partial<Record<DancePack, number>> };
export type DanceStyle = { heard?: DanceHeard | null; picked?: DancePack | null; at: number };

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? Math.round(Math.max(0, Math.min(1, n)) * 1000) / 1000 : 0; };
/** A pack id, migrated ('sad' → 'peaceful'); undefined when it isn't one. */
export const toDancePack = (v: unknown): DancePack | undefined => { if (typeof v !== 'string') return undefined; const p = LEGACY_DANCE_PACKS[v] ?? v; return (DANCE_PACKS as readonly string[]).includes(p) ? p as DancePack : undefined; };

/** A heard result from the page, cleaned; null when it isn't one. */
export function cleanHeard(h: any): DanceHeard | null {
  if (!h || typeof h !== 'object' || !(h.pack === null || toDancePack(h.pack))) return null;
  const top = (Array.isArray(h.top) ? h.top : []).slice(0, 8).filter((t: any) => t && typeof t.c === 'string').map((t: any) => ({ c: t.c.slice(0, 60), s: num(t.s) }));
  const groups: Record<string, number> = {}; for (const k of ['music', 'speech', 'sfx', 'silence']) if (h.groups?.[k] != null) groups[k] = num(h.groups[k]);
  const scores: Partial<Record<DancePack, number>> = {}; for (const [k, v] of Object.entries(h.scores ?? {})) { const p = toDancePack(k); if (p && v != null) scores[p] = num((scores[p] ?? 0) + num(v)); }
  return { pack: h.pack === null ? null : toDancePack(h.pack)!, label: String(h.label ?? '').slice(0, 40), conf: num(h.conf), top, groups, scores };
}

/** Merge a POST body into the saved style. `heard` / `picked` absent = unchanged; `picked: null` clears the pick. Error string on a bad body. */
export function mergeDanceStyle(cur: DanceStyle | null | undefined, body: any): DanceStyle | string {
  if (!body || typeof body !== 'object') return 'Send {heard} and/or {picked}.';
  const next: DanceStyle = { heard: cur?.heard ? cleanHeard(cur.heard) : null, picked: toDancePack(cur?.picked) ?? null, at: Date.now() };
  if ('heard' in body) { const h = body.heard === null ? null : cleanHeard(body.heard); if (body.heard !== null && !h) return 'heard is not a heard style.'; next.heard = h; }
  if ('picked' in body) { const p = body.picked === null ? null : toDancePack(body.picked); if (body.picked !== null && !p) return `picked must be one of ${DANCE_PACKS.join(', ')} or null.`; next.picked = p ?? null; }
  if (!('heard' in body) && !('picked' in body)) return 'Send {heard} and/or {picked}.';
  return next;
}
