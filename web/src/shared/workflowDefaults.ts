/**
 * Per-workflow default models in the Create bar (2026-10-23). The server resolves them (server/src/routing/defaults.ts, shared/imageDefaults.ts)
 * and sends, per image feature, GET /api/tools tool.workflowDefaults[featureId] = { defaultProvider, defaultFallback, editorialDefault }.
 * Order the bar follows:
 *  1. the user's saved pick for that workflow (the workflow draft's provider; for plain Create Image, the form's saved provider);
 *  2. the workflow's default for the active setup (local GPU or a hosted key), when it can run now;
 *  3. the first model that runs (the server's old rule), with its reason line.
 * ★ (2026-10-27): the user's own default for the tool (Make default in the model menu, saved on the server) comes before 2: the server sends
 * it as defaultProvider with defaultSource 'favourite'.
 * A preset, look, Recreate or ?showcase= example that names a model overrides the default for that run without counting as "Your pick";
 * only a pick in the model menu does (draft.pickedBy = 'user').
 */
export interface WfDefault {
  /** The workflow's default for this setup (the row marked "Default"; it may not run here). */ id: string | null;
  /** What the bar starts on when nothing is saved: the default when it runs, else the fallback. */ start: string | null;
  setup: 'local' | 'hosted' | null; runs: boolean; /** why the default can't run (null when it runs) */ reason: string | null;
  /** one short line for the hover card */ why: string | null; /** the server's fallback note when start !== id */ note: string | null;
  /** the user's own default (★) when it is what the bar starts on */ fav?: string | null;
}
export function wfDefaultOf(tool: any, featureId: string | null | undefined): WfDefault | null {
  if (!featureId) return null; /* a feature this tool runs in one of its modes (Create Image's inpaint mode = Brush Edit) */
  const x = tool?.workflowDefaults?.[featureId] ?? Object.values<any>(tool?.defaultsByMode ?? {}).find(m => m?.editorialDefault?.feature === featureId) ?? (tool?.editorialDefault?.feature === featureId ? tool : null);
  const e = x?.editorialDefault; if (!x || !e?.id) return null;
  return { id: e.id, start: x.defaultProvider ?? null, setup: e.setup ?? null, runs: e.runs === true, reason: e.reason ?? null, why: e.why ?? null, note: x.defaultFallback?.note ?? null,
    fav: x.defaultSource === 'favourite' ? x.defaultProvider ?? null : null };
}
/** The model the bar runs: the saved pick when it is offered, else the default's start, else the mode's default (a photo can switch the mode), else the first. */
export function startModel(saved: string | null | undefined, offered: string[], d: WfDefault | null, modeDefault?: string | null): string {
  if (saved && offered.includes(saved)) return saved;
  if (d?.fav && offered.includes(d.fav)) return d.fav;
  if (d?.id && d.runs && offered.includes(d.id)) return d.id;
  if (d?.start && offered.includes(d.start)) return d.start;
  if (modeDefault && offered.includes(modeDefault)) return modeDefault;
  return offered[0] ?? '';
}
export type PickKind = 'default' | 'yours' | 'favourite' | null;
/** What the model button says after the name: "Your default" on the user's own default, "Default" on the default, "Your pick" after a menu pick,
 *  nothing for a link's model or a fallback. */
export const pickKindOf = (current: string, d: WfDefault | null, pickedByUser: boolean): PickKind =>
  d?.fav && current === d.fav ? 'favourite' : d?.id && current === d.id && !d?.fav ? 'default' : pickedByUser ? 'yours' : null;
export const PICK_LABEL: Record<'default' | 'yours' | 'favourite', string> = { default: 'Default', yours: 'Your pick', favourite: 'Your default' };
/** Plain Create Image (no recipe draft): the user's own menu pick per feature, so switching Create / Edit / Camera & Lens keeps each one's pick. */
const PICK_LS = (f: string) => `ohf:wf-pick:${f}`;
export const savedPick = (f: string): string | null => { try { return localStorage.getItem(PICK_LS(f)); } catch { return null; } };
export const savePick = (f: string, id: string | null) => { try { if (id) localStorage.setItem(PICK_LS(f), id); else localStorage.removeItem(PICK_LS(f)); } catch { /* storage off: this visit only */ } };
