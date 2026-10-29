/**
 * Film page logic (pure, no React): lengths, labels, start sources, transitions, trims, takes, new cards and the optimistic ops. Built on
 * the shared film document (server/src/shared/filmProject.ts). Tested in server/test/film-web.test.ts.
 * The workflow it makes easy is the film-making skill's: a row of shot cards (start still → clip → takes), a short first-and-last-frame
 * bridge where the next card needs a new start frame, holds rendered long and trimmed, then Stitch.
 */
import { applyOps, filmStitchBody, shotSubmit, startStillOf, zShot, FILM_VIDEO_TOOL, FILM_MAX_SHOTS, type FilmCard, type FilmOp, type FilmPost, type FilmProject, type FilmShot, type FilmTake, type FilmTransition, type ShotStatus, type TransitionType } from './types';

export { FILM_VIDEO_TOOL, FILM_MAX_SHOTS as MAX_SHOTS };
export const MIN_TRIM_SEC = 0.5;

/** The take in the film: the one picked (starred). The server makes a finished take active when a card has none. */
export const activeTake = (s: FilmShot): FilmTake | null => s.takes.find(t => t.id === s.activeTakeId) ?? null;
/** The newest take, whatever its state (a card that is generating shows it). */
export const latestTake = (s: FilmShot): FilmTake | null => s.takes[s.takes.length - 1] ?? null;
/** A take that plays: done with a file. */
export const playable = (t: FilmTake | null | undefined): t is FilmTake & { url: string } => !!t && t.status === 'done' && !!t.url;
/** The card's full length: its clip's real length, else the length it is set to render at (null = the model's default, unknown yet). */
export const fullLen = (s: FilmShot): number | null => activeTake(s)?.durationSec ?? s.durationSec ?? null;
/** The card's length in the film after its trim (0 when nothing is known yet). */
export function playLen(s: FilmShot): number {
  const full = fullLen(s) ?? 0; const inS = Math.max(0, Math.min(full, s.trim.inSec));
  const out = s.trim.outSec == null ? full : Math.max(inS, Math.min(full, s.trim.outSec));
  return Math.round((out - inS) * 10) / 10;
}
export const isTrimmed = (s: FilmShot): boolean => s.trim.inSec > 0 || (s.trim.outSec != null && (fullLen(s) == null || s.trim.outSec < fullLen(s)!));
/** The cards that are in the film (a hidden card keeps its takes but is left out of length, rough cut and Stitch). */
export const inFilm = (shots: FilmShot[]): FilmShot[] => shots.filter(s => !s.hidden);
/** A card's join into the next one: its own, else the film's (a cut by default). Fade and dip are the same (through black). */
export const seamOf = (s: FilmShot, f: Pick<FilmProject, 'post'>): FilmTransition => s.transitionOut ?? f.post?.transition ?? { type: 'cut', sec: 0 };
/** Length after trims; a crossfade, J-cut or L-cut overlaps its two cards, so it takes its seconds off (a fade through black doesn't). */
const OVERLAPS = new Set<string>(['crossfade', 'jcut', 'lcut']);
export function totalLen(f: Pick<FilmProject, 'shots' | 'post'>): number {
  const v = inFilm(f.shots);
  return Math.max(0, Math.round(v.reduce((n, s, i) => { const t = seamOf(s, f); return n + playLen(s) - (i < v.length - 1 && OVERLAPS.has(t.type) ? t.sec : 0); }, 0) * 10) / 10);
}
/** Spend so far, from the server's tally of the film's takes. */
export const spentOf = (f: Pick<FilmProject, 'spend'>): number => f.spend?.countedUsd ?? 0;
/** "0:42", "1:05:10" */
export const clockOf = (sec: number): string => { const s = Math.max(0, Math.round(sec)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`; };
export const secText = (n: number): string => `${Math.round(n * 10) / 10} s`;
export const usdText = (n: number): string => n <= 0 ? '$0' : `$${n.toFixed(2)}`;

/** "Shot 3" / "Bridge" (bridges don't take a shot number). */
export function shotLabels(shots: FilmShot[]): string[] { let n = 0; return shots.map(s => s.kind === 'bridge' ? 'Bridge' : `Shot ${++n}`); }
export const STATUS_WORD: Record<ShotStatus, string> = { draft: 'Draft', queued: 'Queued', rendering: 'Generating', done: 'Ready', failed: 'Didn’t finish' };
export const isBusy = (s: FilmShot): boolean => s.status === 'queued' || s.status === 'rendering';
export const startUrl = (s: FilmShot): string | null => startStillOf(s)?.url ?? null;
/** What a card still needs before it can render; null when it is ready (the server's own check: shotSubmit). */
export function missingOf(f: Pick<FilmProject, 'id' | 'aspect'>, s: FilmShot): string | null {
  if (!s.prompt.trim()) return s.kind === 'bridge' ? 'Describe the move' : 'Write a prompt';
  const m = shotSubmit(f, s).missing; if (m.includes('image')) return s.kind === 'bridge' ? 'Needs the last frame before it' : 'Add a start still';
  if (m.includes('lastFrame')) return 'Needs the next start still'; return null;
}
/** Where each card's start frame comes from, in words for the card ("Last frame of Shot 2", "Same still as Shot 1", "Text only"). */
export function startSourceOf(shots: FilmShot[], i: number, labels = shotLabels(shots)): string {
  const s = shots[i]; const u = startUrl(s);
  if (!u) return s.types.includes('t2v') ? 'Text only, no start still' : 'No start still yet';
  if (s.startFrom.kind === 'last_frame') { const k = shots.findIndex((p, j) => j < i && p.takes.some(t => t.jobId === s.startFrom.jobId)); return `Last frame of ${k >= 0 ? labels[k] : 'the card before'}`; }
  const same = shots.findIndex((p, k) => k < i && startUrl(p) === u); return same >= 0 ? `Same still as ${labels[same]}` : 'Start still';
}
/** Seam transitions: cut, J-cut / L-cut 0.5–1.5 s (the sound leads or runs on), crossfade 0.4–0.8 s (picture and sound together), fade through black. */
export const XFADE_SECS = [0.4, 0.6, 0.8] as const; export const FADE_SEC = 1;
export const SPLIT_SECS = [0.5, 1, 1.5] as const;
const SPLIT_WORD = { jcut: 'J-cut', lcut: 'L-cut' } as const;
export function transitionText(t: FilmTransition | null | undefined): string {
  return !t || t.type === 'cut' ? 'Cut' : t.type === 'crossfade' ? `Crossfade ${t.sec} s` : t.type === 'jcut' || t.type === 'lcut' ? `${SPLIT_WORD[t.type]} ${t.sec} s` : 'Fade'; }
export function transitionOf(type: TransitionType, prev?: FilmTransition | null): FilmTransition {
  if (type === 'jcut' || type === 'lcut') return { type, sec: (prev?.type === 'jcut' || prev?.type === 'lcut') && (SPLIT_SECS as readonly number[]).includes(prev.sec) ? prev.sec : 1 };
  return type === 'cut' ? { type, sec: 0 } : type === 'crossfade' ? { type, sec: prev?.type === 'crossfade' && (XFADE_SECS as readonly number[]).includes(prev.sec) ? prev.sec : 0.6 } : { type: 'fade', sec: FADE_SEC };
}
/** The join's kind as the gap chip groups it (dip and fade are one). */
export type JoinKind = 'cut' | 'jcut' | 'lcut' | 'crossfade' | 'fade';
export const joinKindOf = (t: FilmTransition): JoinKind => (t.type === 'dip' ? 'fade' : t.type);
/** The free joins, in the order the gap chip lists them, each with its one-line tip (skills/film-making "Editing grammar"). */
export const FREE_JOINS: { kind: JoinKind; name: string; tip: string }[] = [
  { kind: 'cut', name: 'Cut', tip: 'Most good edits are plain cuts. Cut on an action or a look.' },
  { kind: 'jcut', name: 'J-cut', tip: 'The next shot’s sound arrives first and pulls us in. A line, a door, an engine.' },
  { kind: 'lcut', name: 'L-cut', tip: 'This shot’s sound runs on under the next one, so a line or a goodbye lands.' },
  { kind: 'crossfade', name: 'Crossfade', tip: 'A soft blend for time passing. Use it sparingly.' },
  { kind: 'fade', name: 'Fade through black', tip: 'The end of a scene or a jump in time.' },
];
/** Trims move in half seconds (holds are rendered long, then trimmed); extending is the same click as cutting. Out at the end = null. */
export const TRIM_STEP = 0.5;
export function clampTrim(full: number, inSec: number, outSec: number | null): { inSec: number; outSec: number | null } {
  const a = Math.max(0, Math.min(Math.max(0, full - MIN_TRIM_SEC), Math.round(inSec * 10) / 10));
  let b = outSec == null ? null : Math.max(a + MIN_TRIM_SEC, Math.min(full, Math.round(outSec * 10) / 10)); if (b != null && b >= full) b = null;
  return { inSec: a, outSec: b };
}
export function nudgeTrim(s: FilmShot, which: 'in' | 'out', by: number): { inSec: number; outSec: number | null } {
  const full = fullLen(s) ?? 0; const out = s.trim.outSec ?? full;
  return which === 'in' ? clampTrim(full, s.trim.inSec + by, s.trim.outSec) : clampTrim(full, s.trim.inSec, out + by);
}
/** Takes, newest first, the active one leading; `older` are the ones tucked away under "N older takes". */
export function takesView(s: FilmShot, shown = 3): { lead: FilmTake[]; older: FilmTake[] } {
  const a = activeTake(s); const rest = s.takes.filter(t => t !== a).sort((x, y) => y.createdAt - x.createdAt); const all = a ? [a, ...rest] : rest;
  return { lead: all.slice(0, shown), older: all.slice(shown) };
}

const rid = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
/** A new card with the shared defaults (the server parses the same way). Bridges come from the server (POST …/bridge). */
export const newShot = (o: Partial<FilmShot> = {}): FilmShot => zShot.parse({ id: rid('shot'), ...o });
/** Split: a copy of the card right after it (same start still, model and prompt) to rewrite as its own shot; takes stay on the original. */
export function splitShot(s: FilmShot): FilmShot {
  return newShot({ kind: s.kind, prompt: s.prompt, modelKey: s.modelKey, runOn: s.runOn, durationSec: s.durationSec, resolution: s.resolution, types: [...s.types], aspect: s.aspect, audio: s.audio,
    characterIds: [...s.characterIds], startFrom: { ...s.startFrom }, stillUrl: s.stillUrl, stillJobId: s.stillJobId, endFrame: s.endFrame ? { ...s.endFrame } : null });
}
/** Ids in a new order, one card moved by `by` places (keyboard Alt+←/→ and the move buttons). */
export function moveId(ids: string[], id: string, by: number): string[] {
  const i = ids.indexOf(id); const j = Math.max(0, Math.min(ids.length - 1, i + by)); if (i < 0 || i === j) return ids;
  const out = ids.slice(); out.splice(i, 1); out.splice(j, 0, id); return out;
}
/** The ops applied here first, the way the server applies them (shown at once; the server's answer replaces it). Unchanged on an error. */
export function applyLocal(f: FilmProject, ops: FilmOp[]): FilmProject {
  const r = applyOps(f, ops, { newId: rid, now: Date.now() }); return 'film' in r ? r.film : f;
}
/** What Stitch and the rough cut will use and leave out, with the reason per card. */
export function cutPlan(f: FilmProject): { shotIds: string[]; skipped: { shotId: string; reason: string }[] } { const { shotIds, skipped } = filmStitchBody(f); return { shotIds, skipped }; }
/** One line under Stitch: nothing to join yet, or which visible cards are left out. */
export function stitchNote(f: FilmProject): { blocked: string | null; note: string | null } {
  if (!f.shots.length) return { blocked: 'Add a shot first', note: null };
  const { shotIds, skipped } = cutPlan(f); const labels = shotLabels(f.shots); const name = (id: string) => labels[f.shots.findIndex(s => s.id === id)];
  if (!shotIds.length) return { blocked: inFilm(f.shots).length ? 'No card has a finished clip yet' : 'Every card is hidden', note: null };
  const out = skipped.filter(x => x.reason !== 'hidden');
  return { blocked: null, note: out.length ? `Leaves out ${out.map(x => name(x.shotId)).join(', ')} (no clip yet)` : null };
}
/** The stitched length: only the cards Stitch keeps (in the film, with a finished clip), after trims and crossfades. */
export function cutLen(f: FilmProject): number { const keep = new Set(cutPlan(f).shotIds); return totalLen({ ...f, shots: f.shots.filter(s => keep.has(s.id)) }); }

/* ---- IIAYN FILMS: the film label on the opening ident and the end credit ---- */
export const STUDIO = 'IIAYN FILMS';
export const IDENT_TEXT = `${STUDIO} presents`;
export const CREDIT_LEAD = 'Made in Imagination Is All You Need';
/** compose's card text limit (shared/stitchTimeline CARD_TEXT_MAX) */
export const CARD_MAX = 120;
/** The opening ident card: quiet caps on black, the first thing on screen. */
export const identCard = (text = IDENT_TEXT): FilmCard => ({ text, style: 'quiet', mode: 'black', sec: 2.5 });
/** The end credit: the app's name and the real models the takes used, as many as fit the card ("… with MiniMax H3 and LTX-2.5"). */
export function creditText(models: string[]): string {
  const names = [...new Set(models.map(m => m.trim()).filter(Boolean))]; let out = CREDIT_LEAD;
  for (let n = names.length; n > 0; n--) { const shown = names.slice(0, n); const more = names.length - n;
    const list = more ? `${shown.join(', ')} and ${more} more` : shown.length > 1 ? `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}` : shown[0];
    const t = `${CREDIT_LEAD} with ${list}`; if (t.length <= CARD_MAX) { out = t; break; } }
  return out;
}
export const creditCard = (models: string[]): FilmCard => ({ text: creditText(models), style: 'clean', mode: 'black', sec: 3 });
/** A credit the page wrote (its model list follows the cut); one the user rewrote is left alone. */
export const isAutoCredit = (text: string | null | undefined): boolean => !!text && text.startsWith(CREDIT_LEAD);
/** The model keys of the takes in the cut, in film order (null = the Video page's default model). */
export function cutModelKeys(f: FilmProject): (string | null)[] { const keep = new Set(cutPlan(f).shotIds); return [...new Set(f.shots.filter(s => keep.has(s.id)).map(s => s.modelKey))]; }
/** A new film's post: the ident and the credit, on by default (each can be edited or turned off in the Stitch bar). */
export const brandedPost = (): Pick<FilmPost, 'titleCard' | 'endCard'> => ({ titleCard: identCard(), endCard: creditCard([]) });

/* ---- World notes: geography and screen direction, kept in the film's script as one marked block (the schema has no field of its own) ---- */
export const WORLD_MAX = 1000;
const WORLD_RE = /<!-- world -->\n?([\s\S]*?)\n?<!-- \/world -->\n?/;
export const worldNotesOf = (md: string | null | undefined): string => WORLD_RE.exec(md ?? '')?.[1].trim() ?? '';
export function withWorldNotes(md: string | null | undefined, notes: string): string {
  const rest = (md ?? '').replace(WORLD_RE, ''); const t = notes.trim().slice(0, WORLD_MAX);
  return t ? `<!-- world -->\n${t}\n<!-- /world -->\n${rest}` : rest;
}
/** The notes aren't in this prompt yet (so "Add to prompt" is offered). */
export const needsWorld = (prompt: string, notes: string): boolean => !!notes.trim() && !prompt.includes(notes.trim());
export const promptWithWorld = (prompt: string, notes: string): string => { const p = prompt.trimEnd(); return p ? `${p}\n\n${notes.trim()}` : notes.trim(); };

/* ---- Seams: a bridge joins with plain cuts (a blend would smear the exact frames it lands on) ---- */
export function seamLocked(f: Pick<FilmProject, 'shots'>, s: FilmShot): boolean { const i = f.shots.findIndex(x => x.id === s.id); const next = i >= 0 ? f.shots[i + 1] : undefined; /* by id: the film may be a copy */ return s.kind === 'bridge' || next?.kind === 'bridge'; }
export const SEAM_TIPS: Record<JoinKind, string> = {
  cut: 'A straight cut. Cut on an action for the smoothest join.',
  jcut: 'The next shot’s sound starts before its picture. Good for a line or a sound that pulls us in.',
  lcut: 'This shot’s sound carries on under the next picture. Good for letting a line land.',
  crossfade: 'Picture and sound blend together. 0.6 s feels smooth.',
  fade: 'Dips to black and back. Good for a jump in time or place.',
};
export const BRIDGE_SEAM_TIP = 'Bridges join with plain cuts, so their first and last frames line up exactly.';
/** The ops that set every seam into and out of a bridge to a plain cut (after a bridge is added, or to fix an old film). */
export function bridgeCutOps(f: Pick<FilmProject, 'shots' | 'post'>): FilmOp[] {
  return f.shots.filter((s, i) => i < f.shots.length - 1 && seamLocked(f, s) && seamOf(s, f).type !== 'cut').map(s => ({ op: 'upsert_shot' as const, shot: { id: s.id, transitionOut: { type: 'cut' as const, sec: 0 } } }));
}

/* ---- Next-shot ideas: what the connected agent will read (the UI slot is here; the agent call comes with the MCP step) ---- */
export interface NextShotContext {
  filmId: string; shotId: string; aspect: string; kind: FilmShot['kind'];
  /** this card as set: its prompt and model (variations rewrite it) */ prompt: string; modelKey: string | null; modelName: string;
  /** the take in the film (what the next shot follows on from) */ take: { jobId: string; durationSec: number | null; seed: number | null; url: string | null } | null;
  /** that take's last frame, once read */ lastFrameUrl: string | null;
  worldNotes: string; cast: { name: string; lookLine: string }[];
  /** the beat after this card's, from the script (null without beats) */ nextBeat: string | null;
}
export function nextShotContext(f: FilmProject, s: FilmShot, modelName: string, lastFrameUrl: string | null): NextShotContext {
  const t = activeTake(s); const bi = s.beatId ? f.beats.findIndex(b => b.id === s.beatId) : -1;
  return { filmId: f.id, shotId: s.id, aspect: s.aspect ?? f.aspect, kind: s.kind, prompt: s.prompt, modelKey: s.modelKey, modelName,
    take: t ? { jobId: t.jobId, durationSec: t.durationSec, seed: s.seed, url: t.url } : null, lastFrameUrl,
    worldNotes: worldNotesOf(f.script.markdown), cast: f.cast.map(c => ({ name: c.name, lookLine: c.lookLine })), nextBeat: bi >= 0 ? f.beats[bi + 1]?.summary ?? null : null };
}
/** Where a take's last frame goes with one click: the next card's start (a shot, or a bridge that starts there), else a new card after. */
export function lastFrameTarget(f: Pick<FilmProject, 'shots'>, s: FilmShot): { kind: 'start' | 'new'; shot: FilmShot | null } {
  const next = f.shots[f.shots.findIndex(x => x.id === s.id) + 1] ?? null; return next ? { kind: 'start', shot: next } : { kind: 'new', shot: null };
}
/** Where a take's first frame goes: the end frame of the bridge right before this card (a bridge lands on the card's opening). */
export function firstFrameTarget(f: Pick<FilmProject, 'shots'>, s: FilmShot): FilmShot | null { const prev = f.shots[f.shots.findIndex(x => x.id === s.id) - 1]; return prev?.kind === 'bridge' ? prev : null; }


/* ---- Frames match? A cheap look at A's last frame against B's first: colour spread and brightness, no model ---- */
/** A frame's colour histogram (4 levels per channel = 64 bins, summing to 1) and its mean brightness (0–1). */
export interface FrameStats { hist: number[]; luma: number }
export function frameStatsOf(rgba: ArrayLike<number>): FrameStats {
  const hist = new Array(64).fill(0); let lum = 0; let n = 0;
  for (let i = 0; i + 3 < rgba.length; i += 4) { if (rgba[i + 3] < 8) continue; const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
    hist[(r >> 6) * 16 + (g >> 6) * 4 + (b >> 6)]++; lum += 0.2126 * r + 0.7152 * g + 0.0722 * b; n++; }
  return { hist: n ? hist.map(x => x / n) : hist, luma: n ? lum / n / 255 : 0 };
}
export type MatchLevel = 'close' | 'risky' | 'far';
/** 0 (the same) … 1 (nothing alike): half the colours that differ, plus the brightness gap, weighted toward colour. */
export function frameDistance(a: FrameStats, b: FrameStats): number {
  const colour = a.hist.reduce((n, x, i) => n + Math.abs(x - (b.hist[i] ?? 0)), 0) / 2; const light = Math.abs(a.luma - b.luma);
  return Math.min(1, Math.round((0.7 * colour + 0.3 * Math.min(1, light * 2.5)) * 1000) / 1000);
}
export const MATCH_LINE: Record<MatchLevel, string> = {
  close: 'Close: a cut or a bridge will both hold.',
  risky: 'Risky: the colour or light shifts. Cut on an action, or try a bridge and judge it by playing it.',
  far: 'Far apart: a bridge may morph. Try a cut with a sound bridge.',
};
/** Distance cut-offs, set by eye on our own clips: a Continue pair reads about 0.05, two angles of one place 0.2–0.3, a new place 0.35 and up. */
export const MATCH_AT = { close: 0.18, risky: 0.33 } as const;
export const MATCH_WORD: Record<MatchLevel, string> = { close: 'Close', risky: 'Risky', far: 'Far apart' };
export function frameMatch(a: FrameStats, b: FrameStats): { level: MatchLevel; distance: number; line: string } {
  const d = frameDistance(a, b); const level: MatchLevel = d < MATCH_AT.close ? 'close' : d < MATCH_AT.risky ? 'risky' : 'far';
  return { level, distance: d, line: MATCH_LINE[level] };
}

/* ---- Budget: what the film has spent (counted) against what you mean to spend on it ---- */
/** A quote in USD: a sample or a run on your computer is $0; otherwise the place's estimate, else the credits (100 = $1). null = not known. */
export function quoteUsd(q: any): number | null {
  if (!q || typeof q !== 'object') return null; if (q.demo === true) return 0; const c = q.cost && typeof q.cost === 'object' ? q.cost : null;
  if (c?.billedTo === 'local') return 0; if (typeof c?.estUsd === 'number') return c.estUsd; return typeof q.credits === 'number' ? q.credits / 100 : null;
}
export const BUDGET_WARN = 0.8;
export interface BudgetView { spent: number; budget: number | null; left: number | null; share: number; level: 'none' | 'ok' | 'warn' | 'over' }
export function budgetOf(f: Pick<FilmProject, 'spend' | 'budgetUsd'>): BudgetView {
  const spent = spentOf(f); const budget = f.budgetUsd ?? null;
  if (budget == null) return { spent, budget: null, left: null, share: 0, level: 'none' };
  const left = Math.max(0, Math.round((budget - spent) * 100) / 100); const share = budget > 0 ? spent / budget : spent > 0 ? 1 : 0;
  return { spent, budget, left, share, level: share >= 1 ? 'over' : share >= BUDGET_WARN ? 'warn' : 'ok' };
}
/** Why Generate waits: the quote is more than the budget has left (null = it fits, no budget, or no price yet). */
export function budgetBlock(f: Pick<FilmProject, 'spend' | 'budgetUsd'>, q: any): string | null {
  const b = budgetOf(f); const need = quoteUsd(q); if (b.left == null || need == null || need <= 0) return null;
  return need > b.left + 1e-9 ? `Over budget: ${usdText(need)} needed, ${usdText(b.left)} left` : null;
}
/** A typed budget ("5", "$12.50", "") → USD, null to clear; undefined when it doesn't read as money. */
export function parseBudget(text: string): number | null | undefined {
  const t = text.trim().replace(/^\$/, '').replace(/,/g, ''); if (!t) return null; const n = Number(t);
  return Number.isFinite(n) && n >= 0 && n <= 100_000 ? Math.round(n * 100) / 100 : undefined;
}

/* ---- Keyboard: /film/:id shortcuts (off while typing) ---- */
export type FilmKey = 'play' | 'prev' | 'next' | 'continue' | 'gap' | 'again' | 'star' | 'help';
export const SHORTCUTS: { keys: string; what: string; key: FilmKey }[] = [
  { keys: 'Space', what: 'Play or pause the preview', key: 'play' },
  { keys: '← →', what: 'Previous or next card', key: 'prev' },
  { keys: 'C', what: 'Continue from this card’s last frame', key: 'continue' },
  { keys: 'B', what: 'Open the join after this card', key: 'gap' },
  { keys: 'R', what: 'Generate this card again (price first)', key: 'again' },
  { keys: 'S', what: 'Use the newest finished take', key: 'star' },
  { keys: '?', what: 'Show these shortcuts', key: 'help' },
];
/** The target is somewhere you type (or a control that wants the key itself). */
export function isTypingTarget(el: EventTarget | null): boolean {
  const e = el as HTMLElement | null; if (!e || typeof e.tagName !== 'string') return false; const t = e.tagName.toLowerCase();
  if (t === 'textarea' || t === 'select' || e.isContentEditable) return true;
  if (t === 'input') { const ty = ((e as HTMLInputElement).type || 'text').toLowerCase(); return !['checkbox', 'radio', 'range', 'button', 'submit', 'reset', 'color', 'file'].includes(ty); }
  return false;
}
export function filmKeyOf(e: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'target'> & { shiftKey?: boolean }): FilmKey | null {
  if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return null;
  if (e.key === '/' && e.shiftKey) return 'help'; /* "?" on layouts that report the unshifted key */
  switch (e.key) { case ' ': case 'Spacebar': return 'play'; case 'ArrowLeft': return 'prev'; case 'ArrowRight': return 'next'; case '?': return 'help'; }
  const k = e.key.length === 1 ? e.key.toLowerCase() : ''; return k === 'c' ? 'continue' : k === 'b' ? 'gap' : k === 'r' ? 'again' : k === 's' ? 'star' : null;
}
/** The newest finished take that isn't the one in the film yet (S); null when the newest finished one already is. */
export function newestDoneTake(s: FilmShot): FilmTake | null {
  const done = s.takes.filter(t => t.status === 'done' && t.url).sort((a, b) => b.createdAt - a.createdAt)[0] ?? null; return done && done.id !== s.activeTakeId ? done : null;
}
