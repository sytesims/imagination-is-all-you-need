/**
 * Director → Story (H3 multi-shot): a short film of 2–12 connected shots, then one stitched video.
 * Kept for compatibility: Director (and its Story board) was removed from the web app on 2026-10-23. These endpoints, the MCP
 * create_story / story_status / retry_story tools and old story jobs (shown on /jobs/<id>) still work.
 *
 * Design (built ON the existing pipeline, nothing duplicated):
 *  - Every shot is an ordinary Generate Video job (`h3-video`), submitted through the SAME POST /api/tools/h3-video/jobs path
 *    (app.inject). So routing (model + runOn, Auto), quote = charge (quotedRouteId / quotedCredits), the spend log
 *    (one row per shot), demo mode, refunds and the "Powered by MiniMax H3" credit all apply per shot, unchanged.
 *  - The story itself is a PARENT job (toolId `cinema`, input.story) that never enters the queue and is never charged: it holds the
 *    shot list, runs the shots in order, and ends with the stitched film as its output, so the film lands in Assets (Director).
 *    Takes (1–4) = that many parent stories with different seeds, created together (group id).
 *  - Chaining: shot k+1 (chain on) starts from shot k's LAST FRAME (ffmpeg `-sseof`), sent as the `image` of an Image-to-video shot.
 *    H3 can't mix keyframe and reference roles in one request (Comfy Router schema), so the story cast (saved Elements by @name, or
 *    uploads) goes to the shots that do NOT chain (shot 1, a broken chain) as Reference-to-video; chained shots carry the cast in
 *    their first frame. A per-shot start frame (startFrameUrl) overrides the chain.
 *  - Sound: audio on every shot; the stitch keeps each shot's audio with short crossfades (xfade + acrossfade), concat fallback.
 *  - Quote = the sum of the per-shot quotes (GET /api/tools/h3-video/price, same params as the submit) × takes. The team-mode
 *    balance and an optional budget (maxUsd, MCP create_story) are checked on the TOTAL before anything runs.
 *  - Agent budget (X-OHF-Agent-Budget, MCP set_budget): the story's TOTAL must fit what is left BEFORE any shot runs (the submit's 400
 *    agent_budget, nothing charged); then every shot is submitted with the same header, so each one goes through the shared guard (spendGuard
 *    + admitAgentRun) and is tagged with the agent (get_budget / receipt). maxUsd stays an extra cap on this one story. Retry does the same.
 *  - Failure at shot k: the story stops, finished shots are kept. Retry shot k only, or k to the end (POST /retry {from, to}), with
 *    optional edits; or stitch only the finished shots (POST /stitch). A server restart fails a running story (queue.ts boot rule).
 */
import { priceAskAgain } from '../shared/priceChange.js';
import type { FastifyInstance } from 'fastify';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DATA_DIR } from '../config.js';
import { jobs, persistJob, type Job } from '../jobs.js';
import { cancel as cancelJob } from '../queue.js';
import { runFfmpeg, posterFrame } from '../ffmpeg.js';
import { probe } from '../media.js';
import { getTool } from '../tools/registry.js';
import { resolveElements } from '../elements/resolve.js';
import { listElements } from '../library.js';
import { CAMERA_MOVES } from './timeline.js';
import { AGENT_HEADER, admitBudget, budgetById, budgetOfRequest, type AgentBudget } from '../agentBudget.js';

export const STORY_MIN_SHOTS = 2;
export const STORY_MAX_SHOTS = 12;
export const STORY_MAX_TAKES = 4;
export const STORY_MAX_MOVES = 4;
export const STORY_DEFAULT_DURATION = 5;
export const STORY_DEFAULT_CROSSFADE = 0.3;
export const STORY_MAX_CROSSFADE = 0.5;
/** Cast images per story: the local H3 graph has 2 reference slots; hosted H3 (fal / Replicate) takes up to 9, we offer 4. */
export const STORY_MAX_CAST: Record<string, number> = { local: 2, default: 4 };
const TOOL = 'h3-video';
const CONTINUE_PHRASE = 'Continue seamlessly from the opening frame: same characters, place, lighting and style';

export interface ShotSpec { prompt: string; duration?: number; camera?: string | null; cameras?: string[]; continue?: boolean; startFrameUrl?: string | null; seed?: number | null }
/** A shot as planned: what both the quote and the submit use. */
export interface PlannedShot { prompt: string; duration: number; cameras: string[]; continue: boolean; startFrameUrl: string | null; seed: number | null; mode: 't2v' | 'i2v' | 'r2v' }
export interface NormSpec { title?: string; shots: PlannedShot[]; castUrls: string[]; castElements: { id: string; name: string; url: string }[]; model: string; runOn: string; aspect: string; resolution?: string; audio: boolean; style?: string; crossfade: number; takes: number; maxUsd: number | null; seed?: number }
type ShotStatus = 'pending' | 'queued' | 'running' | 'done' | 'failed' | 'canceled';
export interface ShotState extends PlannedShot { status: ShotStatus; progress: number; jobId: string | null; attempts: string[]; thumbUrl: string | null; resultUrl: string | null; lastFrameUrl: string | null; lastFramePath?: string | null; usedSeed?: number | null; quote: ShotQuote | null; error: string | null }
export interface ShotQuote { index: number; mode: string; ok: boolean; credits: number; listCredits: number | null; estUsd: number; realRunUsd: number | null; demo: boolean; route: string | null;
  runOn: string | null; runOnLabel: string | null; billedTo: string | null; billedToName: string | null; estimated: boolean; error?: string; code?: string; durations?: number[] | null }
export interface StoryQuote { ok: boolean; shots: ShotQuote[]; takes: number; perTake: { credits: number; estUsd: number; realRunUsd: number };
  total: { credits: number; estUsd: number; realRunUsd: number; seconds: number; demo: boolean; estimated: boolean; audio: boolean };
  byAccount: { billedTo: string; name: string; estUsd: number }[]; limitBlock: any | null; warn: boolean; overBudget: { maxUsd: number; estUsd: number } | null; teamShort: { needed: number; balance: number } | null; error?: string; code?: string }

const r4 = (n: number) => Math.round(n * 10000) / 10000;
const fileOf = (url: string | null | undefined) => (url && url.startsWith('/files/') ? path.join(DATA_DIR, url.slice('/files/'.length)) : null);
const nothing = { refunded: false, amount: 0, charged: false, note: 'Nothing was charged.' };
const bad = (code: string, field: string, message: string) => ({ error: message, errorType: 'validation', code, issues: [{ code, field, message }], charged: false, refund: nothing });
const okUpload = (u: string) => { const f = fileOf(u); return !!f && /\.(png|jpe?g)$/i.test(f) && existsSync(f) && !path.relative(DATA_DIR, f).startsWith('..'); };

/** Which H3 mode a shot runs in: a start frame (chained or picked) = first frame (i2v); else references when there is a cast. */
export function shotMode(k: number, chain: boolean, castCount: number, startFrame = false): 't2v' | 'i2v' | 'r2v' {
  if (startFrame || (k > 0 && chain)) return 'i2v';
  return castCount > 0 ? 'r2v' : 't2v';
}
/** `@name` mentions of saved Elements become plain names in the text sent to the model (the images travel as references). */
const plainMentions = (t: string) => { const r = resolveElements(t, listElements()); let out = t; for (const m of [...r.mentions].sort((a, b) => b.start - a.start)) out = out.slice(0, m.start) + m.name + out.slice(m.end); return out; };
export function shotPrompt(spec: { style?: string | null }, s: { prompt: string; cameras: string[]; mode: string; startFrameUrl?: string | null }): string {
  const mv = s.cameras.map((id) => CAMERA_MOVES.find((m) => m.id === id)).filter(Boolean) as { phrase: string }[];
  return [s.mode === 'i2v' && !s.startFrameUrl ? CONTINUE_PHRASE : '', plainMentions(s.prompt.trim()), mv.length ? `Camera: ${mv.map((m) => m.phrase).join(', then ')}` : '', spec.style?.trim() ? `Style: ${spec.style.trim()}` : ''].filter(Boolean).join('. ');
}

/** Validate + normalise a story spec (also the export / import JSON). Returns the spec or a 400 body (nothing charged).
 *  Cast = saved Elements (`cast: ['@maya' | '<element id>']`, plus any `@name` in a shot prompt) and/or uploads (`castUrls`): attached once, passed to every shot. */
export function parseSpec(raw: any): { spec: NormSpec } | { body: any } {
  const b = raw && typeof raw === 'object' ? raw : {};
  const shots: ShotSpec[] = Array.isArray(b.shots) ? b.shots : [];
  if (shots.length < STORY_MIN_SHOTS || shots.length > STORY_MAX_SHOTS) return { body: bad('shot_count', 'shots', `A story has ${STORY_MIN_SHOTS}–${STORY_MAX_SHOTS} shots.`) };
  const runOn = typeof b.runOn === 'string' && b.runOn ? b.runOn : typeof b.run_on === 'string' && b.run_on ? b.run_on : 'auto';
  const els = listElements(); const castEls: { id: string; name: string; url: string }[] = [];
  const addEl = (e: { id: string; name: string; url: string }) => { if (!castEls.some((x) => x.id === e.id)) castEls.push({ id: e.id, name: e.name, url: e.url }); };
  for (const c of Array.isArray(b.cast) ? b.cast.map(String) : []) {
    const byId = els.find((e) => e.id === c); if (byId) { addEl(byId); continue; }
    const tag = c.startsWith('@') ? c : `@${c}`; const r = resolveElements(tag, els);
    if (r.unknown.length || !r.attached.length) return { body: bad('unknown_element', 'cast', `Unknown element ${tag}. Add it in Cast & props`) };
    r.attached.forEach(addEl);
  }
  const out: PlannedShot[] = [];
  for (const [i, s] of shots.entries()) {
    if (!s || typeof s.prompt !== 'string' || !s.prompt.trim()) return { body: bad('required', `shots[${i}].prompt`, `Shot ${i + 1}: describe what happens.`) };
    if (s.prompt.length > 4000) return { body: bad('too_long', `shots[${i}].prompt`, `Shot ${i + 1}: the prompt is too long (4,000 characters max).`) };
    if (s.duration != null && !(Number.isInteger(Number(s.duration)) && Number(s.duration) > 0)) return { body: bad('invalid_duration', `shots[${i}].duration`, `Shot ${i + 1}: duration must be whole seconds.`) };
    const cams = [...(Array.isArray(s.cameras) ? s.cameras : []), ...(s.camera ? [s.camera] : [])].map(String);
    if (cams.length > STORY_MAX_MOVES) return { body: bad('too_many', `shots[${i}].cameras`, `Shot ${i + 1}: up to ${STORY_MAX_MOVES} camera moves.`) };
    const um = cams.find((c) => !CAMERA_MOVES.some((m) => m.id === c)); if (um) return { body: bad('unknown_move', `shots[${i}].cameras`, `Shot ${i + 1}: unknown camera move "${um}".`) };
    const r = resolveElements(s.prompt, els); if (r.unknown.length) return { body: bad('unknown_element', `shots[${i}].prompt`, `Shot ${i + 1}: unknown element ${r.unknown[0]}. Add it in Cast & props`) };
    r.attached.forEach(addEl);
    const sf = s.startFrameUrl ? String(s.startFrameUrl) : null; if (sf && !okUpload(sf)) return { body: bad('format', `shots[${i}].startFrameUrl`, `Shot ${i + 1}: the start frame must be a PNG or JPG upload (/files/…).`) };
    const seed = s.seed != null && Number.isInteger(Number(s.seed)) ? Number(s.seed) : null;
    out.push({ prompt: s.prompt.trim(), duration: s.duration != null ? Number(s.duration) : STORY_DEFAULT_DURATION, cameras: cams, continue: i > 0 && s.continue !== false && !sf, startFrameUrl: sf, seed, mode: 't2v' });
  }
  const castUrls: string[] = [...(Array.isArray(b.castUrls) ? b.castUrls.map(String) : []), ...castEls.map((e) => e.url)].filter((u, i, a) => a.indexOf(u) === i);
  const maxCast = runOn === 'local' ? STORY_MAX_CAST.local : STORY_MAX_CAST.default;
  if (castUrls.length > maxCast) return { body: bad('too_many', 'cast', `Up to ${maxCast} cast images${runOn === 'local' ? ' locally' : ''}; this story has ${castUrls.length}.`) };
  for (const u of castUrls) if (!okUpload(u)) return { body: bad('format', 'castUrls', 'Cast images must be PNG or JPG uploads (POST /api/media → /files/…).') };
  for (const [k, s] of out.entries()) s.mode = shotMode(k, s.continue, castUrls.length, !!s.startFrameUrl);
  const crossfade = b.crossfade == null || b.crossfade === '' ? STORY_DEFAULT_CROSSFADE : Number(b.crossfade);
  if (!(crossfade >= 0 && crossfade <= STORY_MAX_CROSSFADE)) return { body: bad('invalid', 'crossfade', `Crossfade must be 0–${STORY_MAX_CROSSFADE} s.`) };
  const takes = b.takes == null || b.takes === '' ? 1 : Number(b.takes);
  if (!(Number.isInteger(takes) && takes >= 1 && takes <= STORY_MAX_TAKES)) return { body: bad('invalid', 'takes', `Takes must be 1–${STORY_MAX_TAKES}.`) };
  const maxUsd = b.maxUsd == null || b.maxUsd === '' ? null : Number(b.maxUsd);
  if (maxUsd != null && !(maxUsd >= 0)) return { body: bad('invalid', 'maxUsd', 'Budget must be a positive amount in USD.') };
  return { spec: { title: typeof b.title === 'string' ? b.title.slice(0, 120) : undefined, shots: out, castUrls, castElements: castEls, model: typeof b.model === 'string' && b.model ? b.model : 'minimax-h3', runOn,
    aspect: typeof b.aspect === 'string' && b.aspect ? b.aspect : '16:9', resolution: typeof b.resolution === 'string' && b.resolution ? b.resolution : undefined,
    audio: b.audio == null ? true : b.audio === true || /^(1|true|on|yes)$/i.test(String(b.audio)), style: typeof b.style === 'string' ? b.style.slice(0, 500) : undefined, crossfade, takes, maxUsd,
    seed: Number.isInteger(Number(b.seed)) && b.seed !== '' && b.seed != null ? Number(b.seed) : undefined } };
}

type FieldSpec = { model?: string; runOn?: string; aspect?: string; resolution?: string | null; audio?: boolean; style?: string | null; seed?: number | null };
/** The exact fields a shot is quoted AND submitted with (quote = charge). Files are markers on the quote, real uploads on the submit. */
function shotFields(spec: FieldSpec, s: Pick<PlannedShot, 'prompt' | 'duration' | 'cameras' | 'mode' | 'seed' | 'startFrameUrl'>, k: number, take = 0): Record<string, string> {
  const f: Record<string, string> = { types: JSON.stringify([s.mode]), prompt: shotPrompt(spec, s), duration: String(s.duration), model: spec.model ?? 'minimax-h3', audio: spec.audio === false ? '0' : '1', aspect: s.mode === 't2v' ? spec.aspect ?? '16:9' : 'auto' };
  if (spec.runOn && spec.runOn !== 'auto') f.runOn = spec.runOn;
  if (spec.resolution) f.resolution = spec.resolution;
  const seed = s.seed != null ? s.seed + take : spec.seed != null ? (spec.seed + k * 7919 + take * 104729) % 2_147_483_647 : null; if (seed != null) f.seed = String(seed);
  return f;
}

/** Export JSON (the open "story workflow"): import it back with POST /api/stories/quote or /api/stories. */
export function exportSpec(j: Job) {
  const st = j.input.story; const shots: ShotState[] = st.shots;
  return { kind: 'openhiggsfield.story', version: 1, title: st.title ?? null, model: st.model, runOn: st.runOn, aspect: st.aspect, resolution: st.resolution ?? null, audio: st.audio, style: st.style ?? null, crossfade: st.crossfade,
    cast: (st.castElements ?? []).map((e: any) => e.id), castNames: (st.castElements ?? []).map((e: any) => `@${e.name}`), castUrls: (st.castUrls as string[]).filter((u) => !(st.castElements ?? []).some((e: any) => e.url === u)),
    shots: shots.map((s) => ({ prompt: s.prompt, duration: s.duration, cameras: s.cameras, continue: s.continue, startFrameUrl: s.startFrameUrl, seed: s.usedSeed ?? s.seed ?? null })) };
}

export function registerStory(app: FastifyInstance) {
  /** Per-shot quote through the shared price endpoint; nothing is charged. */
  async function quoteShot(spec: FieldSpec, s: PlannedShot, k: number): Promise<ShotQuote> {
    const qs = new URLSearchParams(shotFields(spec, s, k)); if (s.mode === 'i2v') qs.set('image', '1'); if (s.mode === 'r2v') qs.set('refs', '1');
    const r = await app.inject({ method: 'GET', url: `/api/tools/${TOOL}/price?${qs}` }); let q: any = {}; try { q = r.json(); } catch { /* */ }
    const base = { index: k + 1, mode: s.mode };
    if (r.statusCode !== 200 || q.priceAvailable === false || q.runnable === false) {
      const msg = q.error ?? q.reason ?? q.unpricedReason ?? (q.runnable === false ? 'this shot can’t run on the chosen model or Run on.' : `quote failed (${r.statusCode}).`);
      return { ...base, ok: false, credits: 0, listCredits: null, estUsd: 0, realRunUsd: null, demo: false, route: null, runOn: null, runOnLabel: null, billedTo: null, billedToName: null, estimated: true,
        error: `Shot ${k + 1}: ${String(msg).replace(/^Shot \d+: /, '')}`, code: q.code ?? (q.runnable === false ? 'not_runnable' : 'quote_failed'), durations: q.durations ?? q.allowedDurations ?? null };
    }
    const c = q.cost ?? {};
    return { ...base, ok: true, credits: Number(q.credits) || 0, listCredits: q.listCredits ?? null, estUsd: Number(c.estUsd) || 0, realRunUsd: c.realRunUsd ?? null, demo: !!q.demo, route: q.route ?? q.routeId ?? null,
      runOn: q.runOn ?? null, runOnLabel: q.runOnLabel ?? null, billedTo: c.billedTo ?? null, billedToName: c.billedToName ?? null, estimated: c.estimated !== false };
  }

  /** Quote = sum of the shot quotes (shots from..to-1) × takes, with the limit / balance / budget checks on the TOTAL. */
  async function quoteStory(spec: FieldSpec & { shots: PlannedShot[]; maxUsd?: number | null; takes?: number }, from = 0, to = spec.shots.length): Promise<StoryQuote> {
    const shots: ShotQuote[] = []; const takes = Math.max(1, spec.takes ?? 1);
    for (let k = from; k < to; k++) shots.push(await quoteShot(spec, spec.shots[k], k));
    const okShots = shots.filter((s) => s.ok); const sum = (f: (s: ShotQuote) => number) => r4(okShots.reduce((a, s) => a + f(s), 0));
    const perTake = { credits: Math.round(sum((s) => s.credits)), estUsd: sum((s) => s.estUsd), realRunUsd: sum((s) => s.realRunUsd ?? 0) };
    const total = { credits: perTake.credits * takes, estUsd: r4(perTake.estUsd * takes), realRunUsd: r4(perTake.realRunUsd * takes), seconds: spec.shots.slice(from, to).reduce((a, s) => a + s.duration, 0),
      demo: okShots.length > 0 && okShots.every((s) => s.demo), estimated: okShots.some((s) => s.estimated), audio: spec.audio !== false };
    const acc = new Map<string, { billedTo: string; name: string; estUsd: number }>();
    for (const s of okShots) if (s.billedTo) { const a = acc.get(s.billedTo) ?? { billedTo: s.billedTo, name: s.billedToName ?? s.billedTo, estUsd: 0 }; a.estUsd = r4(a.estUsd + s.estUsd * takes); acc.set(s.billedTo, a); }
    const L = await import('../ledger.js');
    const limitBlock: any = null; const warn = false; // spending limits removed (2026-10-28); fields kept for older clients
    const overBudget = spec.maxUsd != null && total.estUsd > spec.maxUsd + 1e-9 ? { maxUsd: spec.maxUsd, estUsd: total.estUsd } : null;
    const teamShort = !L.canAfford(total.credits) ? { needed: total.credits, balance: L.getBalance() } : null;
    const firstErr = shots.find((s) => !s.ok);
    const out: StoryQuote = { ok: !firstErr && !overBudget && !teamShort, shots, takes, perTake, total, byAccount: [...acc.values()], limitBlock, warn, overBudget, teamShort };
    if (firstErr) Object.assign(out, { error: firstErr.error, code: firstErr.code });
    else if (overBudget) Object.assign(out, { error: `This story is about $${total.estUsd.toFixed(2)}, over the $${spec.maxUsd!.toFixed(2)} budget. Nothing was charged.`, code: 'over_budget' });
    else if (teamShort) Object.assign(out, { error: `Not enough credits: needs ${teamShort.needed}, balance ${teamShort.balance}.`, code: 'credits' });
    return out;
  }
  const refuse = (reply: any, q: StoryQuote) => reply.code(q.code === 'credits' ? 402 : 400).send({ error: q.error, errorType: q.code === 'credits' ? 'credits' : 'validation', code: q.code, quote: q, issues: [{ code: q.code, field: 'shots', message: q.error }], charged: false, refund: nothing });
  /** The agent budget gate on a story's total (no hold: each shot is admitted and held on its own submit). q null = only check the id
   *  (unknown / closed fails closed, before quoting). refused → the reply was sent. */
  function agentGate(reply: any, b: AgentBudget | { error: string; status: number } | undefined, q: StoryQuote | null, model: string): { agent: { id: string; name: string } | null } | { sent: any } {
    const credits = q ? Math.round(q.shots.filter((x) => x.ok && !x.demo).reduce((a, x) => a + x.credits, 0)) * q.takes : 0;
    const a = admitBudget(q || (b && 'error' in b) ? b : undefined, { jobId: `story:${randomUUID().slice(0, 8)}`, toolId: 'cinema', model, estUsd: q?.total.estUsd ?? 0, credits, hold: false });
    return 'refused' in a ? { sent: reply.code(a.refused.status).send(q ? { ...a.refused.body, quote: q } : a.refused.body) } : a;
  }
  const changed = (reply: any, q: StoryQuote) => reply.code(409).send({ error: 'route_changed', code: 'route_changed', message: 'The price changed since you looked. Review the new total and press Generate again.', quote: q, charged: false, calm: true, refund: nothing });

  app.get('/api/stories/options', async () => {
    const t: any = getTool(TOOL); const VC = await import('../tools/h3/videoCaps.js');
    const durations = ['comfy-h3', 'cloud-h3-wf', 'api-minimax-h3'].map((e) => VC.durationsFor(TOOL, e) ?? []).reduce((a, b) => a.filter((x) => b.includes(x))); // every H3 route Auto may pick
    return { model: 'minimax-h3', modelName: 'MiniMax H3', credit: 'Powered by MiniMax H3', minShots: STORY_MIN_SHOTS, maxShots: STORY_MAX_SHOTS, maxTakes: STORY_MAX_TAKES, maxMovesPerShot: STORY_MAX_MOVES,
      durations, defaultDuration: STORY_DEFAULT_DURATION, aspects: ['16:9', '9:16', '1:1'], resolutions: (t?.app?.resolutionsByProvider?.['comfy-h3'] as string[]) ?? ['768p', '480p'],
      maxCastByRunOn: STORY_MAX_CAST, crossfade: { default: STORY_DEFAULT_CROSSFADE, max: STORY_MAX_CROSSFADE }, cameraMoves: CAMERA_MOVES.map(({ id, label }) => ({ id, label })),
      chain: 'Each shot starts from the previous shot’s last frame (Image to video); shots that don’t chain use the cast as references.' };
  });

  app.post('/api/stories/quote', async (req, reply) => {
    const p = parseSpec(req.body); if ('body' in p) return reply.code(400).send(p.body);
    const q = await quoteStory(p.spec);
    return { ...q, cast: p.spec.castElements.map((e) => ({ id: e.id, name: e.name, url: e.url })), castUrls: p.spec.castUrls, shots: q.shots.map((s, k) => ({ ...s, duration: p.spec.shots[k].duration, continue: p.spec.shots[k].continue })) };
  });

  /** Create + start a story (JSON). 400 / 402 before anything runs when a shot can't be priced, or a limit, the budget or the balance blocks the total. */
  app.post('/api/stories', async (req, reply) => {
    const p = parseSpec(req.body); if ('body' in p) return reply.code(400).send(p.body);
    const ab = budgetOfRequest(req); const g0 = agentGate(reply, ab, null, ''); if ('sent' in g0) return g0.sent; // unknown / closed id: fail closed
    const spec = p.spec; const q = await quoteStory(spec); if (!q.ok) return refuse(reply, q);
    const qc = (req.body as any)?.quotedCredits; const qu = (req.body as any)?.quotedUsd;
    if ((qc != null && qc !== '' && priceAskAgain({ quotedCredits: Number(qc), credits: q.total.credits })) || (qu != null && qu !== '' && q.total.estUsd > Number(qu) + 0.005)) return changed(reply, q); // only a dearer story asks again (D3)
    const g = agentGate(reply, ab, q, spec.model); if ('sent' in g) return g.sent;
    const group = randomUUID().slice(0, 8); const ids: string[] = [];
    for (let t = 0; t < spec.takes; t++) {
      const id = randomUUID().slice(0, 8); const now = Date.now(); ids.push(id);
      const shots: ShotState[] = spec.shots.map((s, k) => ({ ...s, status: 'pending', progress: 0, jobId: null, attempts: [], thumbUrl: null, resultUrl: null, lastFrameUrl: null, quote: q.shots[k], error: null }));
      const seconds = shots.reduce((a, s) => a + s.duration, 0);
      const parent: Job = { id, toolId: 'cinema', provider: 'comfy-h3', status: 'running', stage: 'shot 1', progress: 1, queuePos: 0, eta: seconds * 6, resultUrl: null, outputs: [], error: null, errorType: null, warnings: [], parentId: null, createdAt: now + t, updatedAt: now, startedAt: now, cost: 0, refunded: 0,
        modelKey: spec.model, runOn: spec.runOn === 'auto' ? null : spec.runOn, agent: g.agent,
        input: { mode: 'story', cinemaMode: 'story', types: ['story'], outKind: 'av-video', outputKind: 'video', prompt: spec.title || shots[0].prompt, cleanPrompt: shots[0].prompt, duration: seconds, audio: spec.audio, aspect: spec.aspect, resolution: spec.resolution ?? '768p', n: 1, count: 1, seed: spec.seed ?? null,
          story: { version: 1, group, take: t + 1, takes: spec.takes, title: spec.title ?? null, model: spec.model, runOn: spec.runOn, aspect: spec.aspect, resolution: spec.resolution ?? null, audio: spec.audio, style: spec.style ?? null, crossfade: spec.crossfade, maxUsd: spec.maxUsd ?? null, seed: spec.seed ?? null, agentId: g.agent?.id ?? null,
            castUrls: spec.castUrls, castPaths: spec.castUrls.map((u) => fileOf(u)!), castElements: spec.castElements, shots, quote: { ...q, total: { ...q.total, ...q.perTake } }, failedAt: null, stitch: null, retries: 0 } } };
      jobs.set(id, parent); persistJob(parent);
    }
    for (const [t, id] of ids.entries()) void runStory(jobs.get(id)!, 0, undefined, t); // takes run side by side; each one's shots go through the shared queue
    return { id: ids[0], ids, group, story: storyView(jobs.get(ids[0])!), stories: ids.map((i) => storyView(jobs.get(i)!)), quote: q };
  });

  app.get<{ Querystring: { limit?: string; group?: string } }>('/api/stories', async (req) => {
    const lim = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    return { items: [...jobs.values()].filter((j) => j.input?.story && (!req.query.group || j.input.story.group === req.query.group)).sort((a, b) => b.createdAt - a.createdAt).slice(0, lim).map((j) => { syncStory(j); return storyView(j); }) };
  });
  const need = (id: string, reply: any) => { const j = jobs.get(id); if (!j?.input?.story) { reply.code(404).send({ error: 'No such story.', errorType: 'not_found' }); return null; } syncStory(j); return j; };
  app.get<{ Params: { id: string } }>('/api/stories/:id', async (req, reply) => { const j = need(req.params.id, reply); return j ? storyView(j) : reply; });
  app.get<{ Params: { id: string } }>('/api/stories/:id/export', async (req, reply) => { const j = need(req.params.id, reply); return j ? exportSpec(j) : reply; });

  /** Retry shot `from` only (to = from) or `from` to the end (default), 1-based; `from` defaults to the first unfinished shot. Optional edits for the re-run shots. */
  app.post<{ Params: { id: string }; Body: { from?: number; to?: number; shots?: { index: number; prompt?: string; duration?: number; cameras?: string[]; continue?: boolean }[]; quotedCredits?: number } | undefined }>('/api/stories/:id/retry', async (req, reply) => {
    const j = need(req.params.id, reply); if (!j) return reply;
    const st = j.input.story; const shots: ShotState[] = st.shots; const n = shots.length;
    if (j.status === 'running') return reply.code(409).send({ error: 'This story is still running.', errorType: 'validation', code: 'running' });
    const firstOpen = shots.findIndex((s) => s.status !== 'done'); const maxFrom = firstOpen < 0 ? n : firstOpen; // all done → from = n re-stitches
    const from = req.body?.from != null ? Number(req.body.from) - 1 : maxFrom;
    const to = req.body?.to != null ? Number(req.body.to) : n; // 1-based last shot = 0-based exclusive end
    if (!Number.isInteger(from) || from < 0 || from > maxFrom) return reply.code(400).send(bad('invalid', 'from', `Retry from shot 1–${Math.min(maxFrom + 1, n)}: earlier shots must be finished first.`));
    if (!Number.isInteger(to) || to < Math.min(from + 1, n) || to > n || shots.slice(to).some((s) => s.status !== 'done')) return reply.code(400).send(bad('invalid', 'to', 'Shots after the retried range must already be finished; retry to the end instead.'));
    const edited = shots.map((s) => ({ ...s }));
    for (const e of req.body?.shots ?? []) { const k = Number(e.index) - 1; if (!(k >= from && k < to)) return reply.code(400).send(bad('invalid', 'shots', `Only shots ${from + 1}–${to} can be edited on this retry.`));
      if (e.prompt != null) { if (!String(e.prompt).trim()) return reply.code(400).send(bad('required', `shots[${k}].prompt`, `Shot ${k + 1}: describe what happens.`)); edited[k].prompt = String(e.prompt).trim().slice(0, 4000); }
      if (e.duration != null) { if (!(Number.isInteger(Number(e.duration)) && Number(e.duration) > 0)) return reply.code(400).send(bad('invalid_duration', `shots[${k}].duration`, `Shot ${k + 1}: duration must be whole seconds.`)); edited[k].duration = Number(e.duration); }
      if (e.cameras) { const um = e.cameras.find((c) => !CAMERA_MOVES.some((m) => m.id === c)); if (um || e.cameras.length > STORY_MAX_MOVES) return reply.code(400).send(bad('unknown_move', `shots[${k}].cameras`, `Shot ${k + 1}: unknown camera move or too many moves.`)); edited[k].cameras = [...e.cameras]; }
      if (e.continue != null && k > 0 && !edited[k].startFrameUrl) { edited[k].continue = !!e.continue; edited[k].mode = shotMode(k, edited[k].continue, st.castUrls.length, false); } }
    // Agent budget: the request's header, else the budget the story was created with (a closed or deleted one fails closed).
    const ab = budgetOfRequest(req) ?? (st.agentId ? budgetById(st.agentId) : undefined);
    const g0 = agentGate(reply, ab, null, ''); if ('sent' in g0) return g0.sent;
    const q = await quoteStory({ ...st, takes: 1, shots: edited }, from, to);
    if (!q.ok) return refuse(reply, q);
    if (req.body?.quotedCredits != null && priceAskAgain({ quotedCredits: Number(req.body.quotedCredits), credits: q.total.credits })) return changed(reply, q);
    const g = agentGate(reply, ab, q, st.model); if ('sent' in g) return g.sent;
    if (g.agent) { st.agentId = g.agent.id; j.agent = g.agent; }
    for (let k = from; k < to; k++) Object.assign(shots[k], edited[k], { status: 'pending', progress: 0, jobId: null, thumbUrl: null, resultUrl: null, lastFrameUrl: null, lastFramePath: null, error: null, quote: q.shots[k - from] });
    st.failedAt = null; st.stitch = null; st.retries = (st.retries ?? 0) + 1;
    Object.assign(j, { status: 'running', stage: from < n ? `shot ${from + 1}` : 'stitching', error: null, errorType: null, outputs: [], resultUrl: null, finishedAt: undefined, updatedAt: Date.now(), refund: undefined });
    void runStory(j, from, to);
    return { id: j.id, story: storyView(j), quote: q, from: from + 1, to };
  });

  /** Stitch only the finished shots (in order), e.g. after a failure you don't want to retry. The film replaces the story's output. */
  app.post<{ Params: { id: string }; Body: { crossfade?: number } | undefined }>('/api/stories/:id/stitch', async (req, reply) => {
    const j = need(req.params.id, reply); if (!j) return reply;
    if (j.status === 'running') return reply.code(409).send({ error: 'This story is still running.', errorType: 'validation', code: 'running' });
    const st = j.input.story; const done = (st.shots as ShotState[]).filter((s) => s.status === 'done' && s.resultUrl);
    if (!done.length) return reply.code(400).send(bad('nothing_to_stitch', 'shots', 'No finished shots to stitch yet.'));
    const cf = req.body?.crossfade != null ? Number(req.body.crossfade) : Number(st.crossfade) || 0;
    if (!(cf >= 0 && cf <= STORY_MAX_CROSSFADE)) return reply.code(400).send(bad('invalid', 'crossfade', `Crossfade must be 0–${STORY_MAX_CROSSFADE} s.`));
    st.crossfade = cf; Object.assign(j, { status: 'running', stage: 'stitching', progress: 94, updatedAt: Date.now() });
    const ok = await finishStitch(j, done); persistJob(j);
    return ok ? storyView(j) : reply.code(500).send({ error: 'Stitching the shots failed.', errorType: 'server', story: storyView(j) });
  });

  app.post<{ Params: { id: string } }>('/api/stories/:id/cancel', async (req, reply) => {
    const j = need(req.params.id, reply); if (!j) return reply;
    if (j.status !== 'running') return storyView(j);
    (j as any).cancelStory = true; const cur = (j.input.story.shots as ShotState[]).find((s) => s.status === 'queued' || s.status === 'running');
    const cj = cur?.jobId ? jobs.get(cur.jobId) : null; if (cj) cancelJob(cj); // a queued shot stops now; a generating one finishes, then the story stops
    return storyView(j);
  });

  // ---- runner ----
  async function submitShot(parent: Job, k: number, take: number): Promise<{ id: string } | { error: string; code?: string }> {
    const st = parent.input.story; const s: ShotState = st.shots[k];
    const fields = { ...shotFields(st, s, k, take), parentId: parent.id, rights: '1', quotedCredits: String(s.quote?.credits ?? ''), ...(s.quote?.route ? { quotedRouteId: s.quote.route } : {}) };
    const files: { field: string; file: string }[] = [];
    if (s.mode === 'i2v') {
      const src = s.startFrameUrl ? fileOf(s.startFrameUrl) : (st.shots[k - 1] as ShotState)?.lastFramePath;
      if (!src || !existsSync(src)) return { error: s.startFrameUrl ? `Shot ${k + 1}: its start frame is missing.` : `Shot ${k + 1}: the previous shot's last frame is missing.`, code: 'no_frame' };
      files.push({ field: 'image', file: src });
    }
    if (s.mode === 'r2v') for (const c of st.castPaths as string[]) files.push({ field: 'refs', file: c });
    const { payload, headers } = multipart(fields, files);
    if (st.agentId) (headers as Record<string, string>)[AGENT_HEADER] = st.agentId; // the shot goes through the agent budget guard and is tagged with the agent
    const r = await app.inject({ method: 'POST', url: `/api/tools/${TOOL}/jobs`, payload, headers }); let b: any = {}; try { b = r.json(); } catch { /* */ }
    if (r.statusCode !== 200 || !b.id) return { error: `Shot ${k + 1}: ${b.message ?? b.error ?? `submit failed (${r.statusCode})`}`, code: b.code ?? 'submit_failed' };
    return { id: b.id };
  }

  async function finishStitch(parent: Job, done: ShotState[]): Promise<boolean> {
    const st = parent.input.story; const all = (st.shots as ShotState[]).every((s) => s.status === 'done');
    const outName = `${parent.id}-story-${Date.now().toString(36)}.mp4`; const outPath = path.join(DATA_DIR, outName);
    const r = await stitchClips(done.map((s) => fileOf(s.resultUrl)!), outPath, Number(st.crossfade) || 0);
    if (!r.ok) { Object.assign(parent, { status: 'failed', stage: 'failed', errorType: 'temporary', error: 'Stitching the shots failed. Your shots are kept; try Stitch again.', finishedAt: Date.now(), updatedAt: Date.now(), eta: 0 }); return false; }
    st.stitch = { url: `/files/${outName}`, seconds: r.seconds, crossfade: r.crossfade, method: r.method, audio: r.audio, shots: done.map((s) => (st.shots as ShotState[]).indexOf(s) + 1), partial: !all };
    const label = st.title || (st.takes > 1 ? `Story · take ${st.take}` : 'Story');
    Object.assign(parent, { status: 'done', stage: 'done', progress: 100, eta: 0, outputs: [{ label: all ? label : `${label} (${done.length} of ${st.shots.length} shots)`, url: `/files/${outName}` }], resultUrl: `/files/${outName}`, finishedAt: Date.now(), updatedAt: Date.now(), error: null, errorType: null });
    parent.input.duration = Math.round(r.seconds * 100) / 100; return true;
  }

  async function runStory(parent: Job, from: number, to?: number, take = (parent.input.story.take ?? 1) - 1) {
    const st = parent.input.story; const shots: ShotState[] = st.shots; const n = shots.length; const end = to ?? n; delete (parent as any).cancelStory;
    const fail = (k: number, msg: string, code = 'temporary') => { if (shots[k].status !== 'canceled') shots[k].status = 'failed'; shots[k].error = msg; st.failedAt = k + 1;
      Object.assign(parent, { status: 'failed', stage: 'failed', errorType: code, error: `${msg.replace(/\.?\s*$/, '.')} Finished shots are kept; retry from shot ${k + 1}.`, finishedAt: Date.now(), updatedAt: Date.now(), eta: 0 }); };
    const stop = (k: number) => { for (let i = k; i < end; i++) if (shots[i].status !== 'done') shots[i].status = 'canceled'; Object.assign(parent, { status: 'canceled', stage: 'canceled', error: null, finishedAt: Date.now(), updatedAt: Date.now(), eta: 0 }); };
    try {
      for (let k = from; k < end; k++) {
        const s = shots[k];
        if ((parent as any).cancelStory) return stop(k);
        s.status = 'queued'; s.error = null; parent.stage = `shot ${k + 1}`; parent.updatedAt = Date.now();
        const sub = await submitShot(parent, k, take);
        if ('error' in sub) return fail(k, sub.error, sub.code === 'route_changed' ? 'route_changed' : 'validation');
        s.jobId = sub.id; s.attempts = [...(s.attempts ?? []), sub.id];
        const child = await waitJob(sub.id, (cj) => { s.status = cj.status === 'running' ? 'running' : 'queued'; s.progress = cj.progress ?? 0;
          parent.progress = Math.max(1, Math.round(((k + s.progress / 100) / n) * 92)); parent.eta = (cj.eta ?? 0) + shots.slice(k + 1, end).reduce((a, x) => a + x.duration * 6, 0); parent.updatedAt = Date.now(); });
        if (!child || child.status !== 'done' || !child.resultUrl) {
          if (child?.status === 'canceled' || (parent as any).cancelStory) return stop(k);
          const why = child?.status === 'needs_decision' ? (child.decision?.note ?? 'it needs a choice of route') : (child?.error ?? 'the shot did not finish');
          return fail(k, `Shot ${k + 1} failed: ${why}`, child?.errorType ?? 'temporary');
        }
        const out = fileOf(child.resultUrl)!;
        const last = path.join(DATA_DIR, `${parent.id}-s${k + 1}-${sub.id}-last.png`); const thumb = path.join(DATA_DIR, `${parent.id}-s${k + 1}-${sub.id}-thumb.jpg`);
        if (!(await lastFrame(out, last))) return fail(k, `Shot ${k + 1}: couldn't read its last frame.`);
        const thumbOk = (await posterFrame(out, thumb, { scale: '480:-2' })) === 0 && existsSync(thumb);
        Object.assign(s, { status: 'done', progress: 100, resultUrl: child.resultUrl, lastFramePath: last, lastFrameUrl: `/files/${path.basename(last)}`, thumbUrl: `/files/${path.basename(thumbOk ? thumb : last)}`, usedSeed: Number.isInteger(child.input?.seed) ? child.input.seed : null, error: null });
        if (k === 0 || parent.provider === 'comfy-h3') { parent.provider = child.provider; if (child.modelKey) parent.modelKey = child.modelKey; parent.runOn = child.runOn ?? parent.runOn; if (child.routing) { parent.routing = child.routing; parent.route = child.route ?? null; } } // first shot's route on the story job (demo flag, Run on line)
      }
      if (shots.some((s) => s.status !== 'done')) { const k = shots.findIndex((s) => s.status !== 'done'); return fail(k, `Shot ${k + 1} isn't finished.`); }
      parent.stage = 'stitching'; parent.progress = 94; parent.updatedAt = Date.now();
      await finishStitch(parent, shots);
    } catch (e) {
      const k = shots.findIndex((s) => s.status !== 'done'); fail(k < 0 ? n - 1 : k, `Shot ${(k < 0 ? n - 1 : k) + 1}: ${e instanceof Error ? e.message : String(e)}`);
    } finally { persistJob(parent); }
  }
}

/** Wait for a queue job to end (done / failed / canceled / blocked / needs_decision). */
async function waitJob(id: string, onTick: (j: Job) => void): Promise<Job | null> {
  for (;;) {
    const j = jobs.get(id); if (!j) return null;
    if (['done', 'failed', 'canceled', 'blocked', 'needs_decision'].includes(j.status)) return j;
    onTick(j); await new Promise((r) => setTimeout(r, 250));
  }
}

/** After a restart the runner is gone: bring shot states in line with their jobs (a running shot whose story ended). */
export function syncStory(j: Job) {
  const st = j.input?.story; if (!st || j.status === 'running') return;
  for (const [k, s] of (st.shots as ShotState[]).entries()) {
    if (s.status !== 'queued' && s.status !== 'running') continue;
    const cj = s.jobId ? jobs.get(s.jobId) : null;
    s.status = cj?.status === 'canceled' ? 'canceled' : 'failed'; s.error ??= cj?.error ?? 'Interrupted.'; st.failedAt ??= k + 1;
  }
}

let attrFn: ((j: any) => any) | null = null;
void import('../attribution.js').then((m) => { attrFn = m.jobAttribution; }).catch(() => {});

export function storyView(j: Job) {
  const st = j.input.story; const shots: ShotState[] = st.shots;
  let attribution: any = null; try { attribution = attrFn ? attrFn(j) : null; } catch { /* */ }
  return { id: j.id, jobId: j.id, group: st.group ?? null, take: st.take ?? 1, takes: st.takes ?? 1, title: st.title ?? null, status: j.status, stage: j.stage, progress: j.progress, eta: j.eta, error: j.error, errorType: j.errorType ?? null, failedAt: st.failedAt ?? null,
    model: st.model, modelKey: j.modelKey ?? st.model, runOn: st.runOn, aspect: st.aspect, resolution: st.resolution, audio: st.audio, style: st.style, crossfade: st.crossfade, maxUsd: st.maxUsd ?? null,
    cast: (st.castElements ?? []).map((e: any) => ({ id: e.id, name: e.name, url: e.url })), castUrls: st.castUrls,
    shots: shots.map((s, k) => ({ index: k + 1, prompt: s.prompt, duration: s.duration, cameras: s.cameras ?? [], continue: s.continue, startFrameUrl: s.startFrameUrl ?? null, mode: s.mode, status: s.status, progress: s.progress, jobId: s.jobId, attempts: s.attempts ?? [],
      thumbUrl: s.thumbUrl, resultUrl: s.resultUrl, lastFrameUrl: s.lastFrameUrl, seed: s.usedSeed ?? s.seed ?? null, error: s.error, credits: s.quote?.credits ?? 0, estUsd: s.quote?.estUsd ?? 0, realRunUsd: s.quote?.realRunUsd ?? null, route: s.quote?.route ?? null, runOnLabel: s.quote?.runOnLabel ?? null, demo: !!s.quote?.demo })),
    quote: st.quote ? { total: st.quote.total, byAccount: st.quote.byAccount } : null, resultUrl: j.resultUrl, outputs: j.outputs, stitch: st.stitch ?? null, demo: shots.some((s) => s.quote?.demo),
    attribution, createdAt: j.createdAt, finishedAt: j.finishedAt ?? null, retries: st.retries ?? 0 };
}

// ---- ffmpeg helpers ----
/** Last frame of a clip as PNG (`-sseof` near the end; `-update 1` keeps overwriting, so the final decoded frame stays). */
export async function lastFrame(src: string, out: string): Promise<boolean> {
  rmSync(out, { force: true });
  for (const tail of ['-0.25', '-1', '-3']) if (await runFfmpeg(['-y', '-v', 'error', '-sseof', tail, '-i', src, '-an', '-update', '1', out]) === 0 && existsSync(out)) return true;
  return await runFfmpeg(['-y', '-v', 'error', '-i', src, '-an', '-update', '1', out]) === 0 && existsSync(out);
}

/** Stitch clips into one MP4 with consistent audio: normalise size / fps / audio (silence where a clip has none), then
 *  xfade + acrossfade between shots (`fade` s). Falls back to a plain concat when the crossfade graph fails or fade is 0. */
export async function stitchClips(clips: string[], out: string, fade: number): Promise<{ ok: boolean; seconds: number; crossfade: number; method: 'xfade' | 'concat'; audio: boolean }> {
  const fail = { ok: false, seconds: 0, crossfade: 0, method: 'concat' as const, audio: false };
  if (!clips.length) return fail;
  const p0 = await probe(clips[0]); if (!p0) return fail;
  const W = Math.max(2, Math.round(p0.width / 2) * 2), H = Math.max(2, Math.round(p0.height / 2) * 2);
  const parts: string[] = []; const durs: number[] = []; let anyAudio = false;
  const enc = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart'];
  try {
    for (const [i, c] of clips.entries()) {
      const pc = await probe(c); if (!pc) return fail; anyAudio ||= pc.hasAudio; const part = `${out}.part${i}.mp4`; parts.push(part); const d = pc.duration || 5;
      const vf = `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=24,format=yuv420p`;
      const args = ['-y', '-v', 'error', '-i', c, ...(pc.hasAudio ? [] : ['-f', 'lavfi', '-t', String(d), '-i', 'anullsrc=r=48000:cl=stereo']),
        '-map', '0:v:0', '-map', pc.hasAudio ? '0:a:0' : '1:a:0', '-vf', vf, '-af', 'aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo', '-t', String(d), ...enc, part];
      if (await runFfmpeg(args) !== 0) return fail;
      durs.push((await probe(part))?.duration || d);
    }
    const f = clips.length > 1 ? Math.min(fade, Math.min(...durs) / 3) : 0;
    const inputs = parts.flatMap((p) => ['-i', p]);
    if (parts.length === 1) { const code = await runFfmpeg(['-y', '-v', 'error', '-i', parts[0], '-c', 'copy', '-movflags', '+faststart', out]); return code === 0 ? { ok: true, seconds: durs[0], crossfade: 0, method: 'concat', audio: anyAudio } : fail; }
    if (f >= 0.05) {
      const v: string[] = []; const a: string[] = []; let off = 0; let pv = '[0:v]'; let pa = '[0:a]';
      for (let i = 1; i < parts.length; i++) { off += durs[i - 1] - f; const last = i === parts.length - 1; const nv = last ? '[vout]' : `[v${i}]`; const na = last ? '[aout]' : `[a${i}]`;
        v.push(`${pv}[${i}:v]xfade=transition=fade:duration=${f.toFixed(3)}:offset=${off.toFixed(3)}${nv}`); a.push(`${pa}[${i}:a]acrossfade=d=${f.toFixed(3)}${na}`); pv = nv; pa = na; }
      if (await runFfmpeg(['-y', '-v', 'error', ...inputs, '-filter_complex', [...v, ...a].join(';'), '-map', '[vout]', '-map', '[aout]', ...enc, out]) === 0 && existsSync(out))
        return { ok: true, seconds: (await probe(out))?.duration ?? 0, crossfade: Math.round(f * 1000) / 1000, method: 'xfade', audio: anyAudio };
    }
    const cc = parts.map((_, i) => `[${i}:v][${i}:a]`).join('') + `concat=n=${parts.length}:v=1:a=1[vout][aout]`;
    if (await runFfmpeg(['-y', '-v', 'error', ...inputs, '-filter_complex', cc, '-map', '[vout]', '-map', '[aout]', ...enc, out]) === 0 && existsSync(out))
      return { ok: true, seconds: (await probe(out))?.duration ?? 0, crossfade: 0, method: 'concat', audio: anyAudio };
    return fail;
  } finally { for (const p of parts) rmSync(p, { force: true }); }
}

/** multipart/form-data body for app.inject (fields + files read from disk). */
function multipart(fields: Record<string, string>, files: { field: string; file: string }[]) {
  const boundary = `----ohfstory${randomUUID().replace(/-/g, '')}`; const chunks: Buffer[] = [];
  for (const [k, v] of Object.entries(fields)) chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  for (const f of files) { const ext = path.extname(f.file).toLowerCase(); const type = ext === '.png' ? 'image/png' : /\.jpe?g$/.test(ext) ? 'image/jpeg' : 'application/octet-stream';
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${f.field}"; filename="${path.basename(f.file)}"\r\nContent-Type: ${type}\r\n\r\n`), readFileSync(f.file), Buffer.from('\r\n')); }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return { payload: Buffer.concat(chunks), headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
}
