/**
 * Plain-word model search (agent path audit 2026-11-07 #5): "Kling 15 s from an image" → {tool_id:"h3-video", model:"kling-v3", fields:{types:["i2v"],
 * duration:"15"}} with why it fits. Built only from what the app serves:
 *  - GET /api/tools → each tool's models (key, name, aliases, maker, family, the places it runs with status and price) and the tool's own inputs
 *    (types options, duration, resolution);
 *  - GET /api/models?toolId= → per model: modes (t2v, i2v, flf, r2v…), seconds (min/max/list), resolutions and their defaults.
 * parseIntent pulls the phrases out of the query (seconds, mode, resolution, free / on my computer, media words) and leaves the name words;
 * matchModels scores tool × model pairs on those words (whole words or word starts, never stems: "kling" never matches "klein") and judges each
 * against the parsed limits. Pure apart from the fetch the caller passes in; test/model-search.ts covers it.
 */
export type Mode = 't2v' | 'i2v' | 'flf' | 'r2v' | 'v2v';
export interface Intent { seconds: number | null; mode: Mode | null; resolution: string | null; free: boolean; local: boolean; media: string | null; words: string[] }
const MODE_LABEL: Record<Mode, string> = { t2v: 'text to video', i2v: 'image to video', flf: 'first and last frame', r2v: 'reference to video', v2v: 'video to video' };

const norm = (s: unknown) => String(s ?? '').toLowerCase().replace(/[’']/g, '').replace(/[_/·•:,;!?()"]+/g, ' ').replace(/\s+/g, ' ').trim();
const STOP = new Set(['a', 'an', 'the', 'to', 'of', 'for', 'and', 'or', 'in', 'on', 'with', 'my', 'me', 'i', 'it', 'is', 'make', 'how', 'can', 'do', 'want', 'please', 'some', 'this', 'that', 'by', 'using', 'use', 'model', 'models', 'long', 'clip', 'run', 'runs', 'at', 'from']);
const MEDIA: [RegExp, string][] = [[/\b(videos?|clips?|movies?|films?|animations?)\b/g, 'video'], [/\b(images?|pictures?|photos?|stills?)\b/g, 'image'], [/\b(audio|music|songs?|sound|sfx|voices?|speech)\b/g, 'audio'], [/\b(3d|mesh|meshes)\b/g, '3d']];

/** The query's phrases → limits; the words left are names (kling, seedance, veo…). */
export function parseIntent(q: string): Intent {
  let s = ` ${norm(q).replace(/(\d)\s*-\s*(\d)/g, '$1 $2')} `; const cut = (re: RegExp) => { const m = s.match(re); if (m) s = s.replace(re, ' '); return m; };
  const sec = cut(/\b(\d{1,3}(?:\.\d)?)\s*(?:s|sec|secs|seconds?)\b/) ?? cut(/\b(\d{1,3})\s*-?\s*second\b/);
  let mode: Mode | null = null;
  if (cut(/\b(first (?:and|&|\+)? ?last frames?|start (?:and|&) end frames?|first last frames?|flf|keyframes?)\b/)) mode = 'flf';
  else if (cut(/\b(from (?:an? |my |the )?(?:image|photo|picture|still|frame)|(?:image|photo|picture) (?:to|2|into) video|i2v|animate (?:an? |my |the )?(?:image|photo|picture)|img2vid)\b/)) mode = 'i2v';
  else if (cut(/\b(from (?:a |my |the )?(?:text|prompt)|text (?:to|2) video|t2v|txt2vid)\b/)) mode = 't2v';
  else if (cut(/\b(from (?:my |the )?references?|reference (?:to )?video|r2v|with references?)\b/)) mode = 'r2v';
  else if (cut(/\b(video (?:to|2) video|v2v|from (?:a |my |the )?video)\b/)) mode = 'v2v';
  const res = cut(/\b(480p|540p|576p|720p|768p|1080p|1440p|2k|4k)\b/);
  const local = !!cut(/\b(on (?:my|this|your) (?:computer|machine|mac|pc|gpu|laptop)|locally|local|offline|own gpu|my gpu)\b/);
  const free = !!cut(/\b(free|for free|no cost|costs? nothing|\$0)\b/) || local;
  let media: string | null = mode ? 'video' : null;
  for (const [re, m] of MEDIA) if (s.match(re)) { media ??= m; s = s.replace(re, ' '); }
  const words = s.split(' ').filter((w) => w && !STOP.has(w));
  return { seconds: sec ? Number(sec[1]) : null, mode, resolution: res ? res[1].toUpperCase().replace(/P$/, 'p') : null, free, local, media, words };
}

/** Whole-word or word-start match: "kling" → "kling", "kling-v3", "kling 3.0"; never a stem ("kl" → klein). Short words (≤ 2 letters) must be whole. */
const wordHit = (hay: string[], w: string) => hay.some((h) => h === w || (w.length >= 3 && h.startsWith(w)) || (w.length >= 4 && h.replace(/[-.]/g, '').startsWith(w.replace(/[-.]/g, ''))));
const tokens = (...xs: unknown[]) => [...new Set(xs.flat().map(norm).join(' ').split(/[\s]+/).flatMap((t) => [t, ...t.split(/[-.]/)]).filter(Boolean))];

export interface ModelLimits { modes: string[] | null; minSeconds: number | null; maxSeconds: number | null; durations: number[] | null; resolutions: string[] | null; defaultResolution: string | null; defaultSeconds: number | null }
/** One model's limits on one tool, from its /api/models?toolId= engines (union over the engines of that model key). */
export function limitsFromEngines(engines: any[]): ModelLimits {
  const u = <T>(xs: (T[] | null | undefined)[]) => { const a = xs.filter(Array.isArray).flat() as T[]; return a.length ? [...new Set(a)] : null; };
  const caps = engines.map((e) => e.capabilities ?? e.videoLimits ?? {});
  const mins = caps.map((c) => c.minSeconds).filter((x) => typeof x === 'number'); const maxs = caps.map((c) => c.maxSeconds).filter((x) => typeof x === 'number');
  const durations = u<number>(caps.map((c) => c.durations ?? c.duration?.values))?.map(Number).sort((a, b) => a - b) ?? null;
  return { modes: u<string>(engines.map((e) => e.modes)), minSeconds: mins.length ? Math.min(...mins) : null, maxSeconds: maxs.length ? Math.max(...maxs) : null, durations,
    resolutions: u<string>([...caps.map((c) => c.resolutions), ...engines.map((e) => e.resolutions)]), defaultResolution: engines.find((e) => e.defaultResolution)?.defaultResolution ?? caps.find((c) => c.defaultResolution)?.defaultResolution ?? null,
    defaultSeconds: caps.find((c) => typeof c.defaultSeconds === 'number')?.defaultSeconds ?? null };
}

export interface ModelHit { tool_id: string; toolName: string; model: string; name: string; maker: string | null; score: number; fits: boolean; why: string[]; notes: string[];
  run: { tool_id: string; model: string; fields: Record<string, unknown>; run_on?: string }; places: { run_on: string; status: string; usd: number | null }[]; limits: ModelLimits | null }

/** Text score of a model for the name words: every word must hit the model (key, names, aliases, maker, family) or the tool; 0 = no match. */
export function nameScore(t: any, m: any, words: string[]): number {
  if (!words.length) return 1;
  const own = tokens(m.key, m.displayName, m.name); const mh = tokens(m.key, m.displayName, m.name, m.family, m.maker, m.makerName, m.aliases ?? []); const th = tokens(t.id, t.name);
  let s = 0; for (const w of words) { if (wordHit(own, w)) s += 4; /* its own name beats an alias ("veo" → Veo 3.1 before Gemini Omni) */ else if (wordHit(mh, w)) s += 3; else if (wordHit(th, w)) s += 1; else return 0; }
  return s;
}
const typesOf = (t: any): string[] => ((t.inputs ?? []).find((i: any) => i.name === 'types')?.options ?? []).map(String);
const hasInput = (t: any, n: string) => (t.inputs ?? []).some((i: any) => i.name === n);
const isApp = (t: any) => /^app-/.test(t.id) || !!t.app?.gallery?.locked;

/** Judge one tool × model against the intent; returns the hit with ready run arguments. */
export function judge(t: any, m: any, lim: ModelLimits | null, it: Intent, score: number): ModelHit {
  const why: string[] = []; const notes: string[] = []; let fits = true; const fields: Record<string, unknown> = {};
  const places = (m.runsOn ?? []).map((r: any) => ({ run_on: r.id, status: r.status, usd: r.id === 'local' ? 0 : typeof r.credits === 'number' ? r.credits / 100 : null }));
  const types = typesOf(t);
  if (it.mode) {
    const can = (lim?.modes ?? types).includes(it.mode) && (types.length ? types.includes(it.mode) : false);
    if (can) { fields.types = [it.mode]; why.push(`${MODE_LABEL[it.mode]} ✓`); } else { fits = false; why.push(`no ${MODE_LABEL[it.mode]} here${lim?.modes?.length ? ` (it does ${lim.modes.map((x) => MODE_LABEL[x as Mode] ?? x).join(', ')})` : ''}`); }
  } else if (types.length && hasInput(t, 'types')) { const first = (lim?.modes ?? types).find((x) => types.includes(x)) ?? types[0]; fields.types = [first]; notes.push(`types defaults to ${first} here; change it for another mode`); }
  if (it.seconds != null) {
    const { minSeconds: lo, maxSeconds: hi, durations: list } = lim ?? ({} as ModelLimits);
    const inRange = (lo == null || it.seconds >= lo) && (hi == null || it.seconds <= hi) && (!list?.length || list.includes(it.seconds));
    if (!hasInput(t, 'duration') && lo == null && hi == null) { fits = false; why.push('no length setting on this tool'); }
    else if (inRange) { fields.duration = String(it.seconds); why.push(`${it.seconds} s ✓${lo != null || hi != null ? ` (${lo ?? '?'}–${hi ?? '?'} s)` : ''}`); }
    else { fits = false; const near = list?.length ? list.reduce((a, b) => (Math.abs(b - it.seconds!) < Math.abs(a - it.seconds!) ? b : a)) : Math.min(hi ?? it.seconds, Math.max(lo ?? it.seconds, it.seconds));
      why.push(`${it.seconds} s is outside ${list?.length ? `its lengths (${list.join(', ')} s)` : `${lo ?? '?'}–${hi ?? '?'} s`}; nearest ${near} s`); fields.duration = String(near); }
  }
  if (it.resolution) {
    const rs = lim?.resolutions ?? null;
    if (!rs || rs.map((x) => x.toLowerCase()).includes(it.resolution.toLowerCase())) { if (rs) { fields.resolution = rs.find((x) => x.toLowerCase() === it.resolution!.toLowerCase()); why.push(`${it.resolution} ✓`); } }
    else { fits = false; why.push(`no ${it.resolution} (it makes ${rs.join(', ')})`); }
  }
  let run_on: string | undefined;
  if (it.free || it.local) {
    const loc = places.find((p: any) => p.run_on === 'local');
    if (loc) { run_on = 'local'; why.push(`free on this computer ✓${loc.status !== 'ready' ? ` (status: ${loc.status})` : ''}`); }
    else { fits = false; why.push('no free local run (cloud only)'); }
  } else {
    const ready = places.filter((p: any) => p.status === 'ready'); const cheapest = ready.filter((p: any) => p.usd != null).sort((a: any, b: any) => a.usd - b.usd)[0];
    if (ready.length) why.push(`runs on ${ready.map((p: any) => p.run_on).join(', ')}${cheapest ? ` (from $${cheapest.usd.toFixed(2)} at the default settings)` : ''}`);
    else { notes.push(`not ready to run here yet: ${places.map((p: any) => `${p.run_on} ${p.status}`).join(', ') || 'no place'}`); }
  }
  return { tool_id: t.id, toolName: t.name, model: m.key, name: m.displayName ?? m.name ?? m.key, maker: m.makerName ?? null, score, fits, why, notes,
    run: { tool_id: t.id, model: m.key, fields, ...(run_on ? { run_on } : {}) }, places, limits: lim };
}

/** Rank tool × model pairs for an intent. getLimits(toolId) returns that tool's /api/models engines (cached by the caller). */
export async function matchModels(tools: any[], it: Intent, getLimits: (toolId: string) => Promise<any[]>, max = 8): Promise<ModelHit[]> {
  const named = it.words.length > 0;
  if (!named && !it.mode && it.seconds == null && !it.resolution && !it.free) return [];
  const pairs: { t: any; m: any; s: number }[] = [];
  for (const t of tools) { if (it.media && t.media !== it.media && !(it.mode && t.media === 'video')) continue;
    for (const m of t.models ?? []) { const s = nameScore(t, m, it.words); if (s > 0) pairs.push({ t, m, s }); } }
  if (!pairs.length) return [];
  // the tools worth reading limits for: those with the most matching models, general tools first (Generate Video before an app that locks a mode)
  const byTool = new Map<string, number>(); for (const p of pairs) byTool.set(p.t.id, (byTool.get(p.t.id) ?? 0) + p.s);
  const toolRank = (t: any) => (isApp(t) ? 0 : 2) + (typesOf(t).length ? 1 : 0) /* a generator with modes (Generate Video, Create Image) before an edit tool */ + (it.mode && typesOf(t).includes(it.mode) ? 3 : 0) + (hasInput(t, 'duration') && it.seconds != null ? 1 : 0);
  const tops = [...byTool.keys()].map((id) => tools.find((t) => t.id === id)).sort((a, b) => toolRank(b) - toolRank(a) || byTool.get(b.id)! - byTool.get(a.id)!).slice(0, named ? 5 : 3);
  const lims = new Map<string, Map<string, ModelLimits>>();
  await Promise.all(tops.map(async (t) => { const engines = await getLimits(t.id).catch(() => []); const byKey = new Map<string, any[]>();
    for (const e of engines) if (e.modelKey) byKey.set(e.modelKey, [...(byKey.get(e.modelKey) ?? []), e]);
    lims.set(t.id, new Map([...byKey].map(([k, es]) => [k, limitsFromEngines(es)]))); }));
  const hits = pairs.filter((p) => lims.has(p.t.id)).map((p) => { const h = judge(p.t, p.m, lims.get(p.t.id)!.get(p.m.key) ?? null, it, p.s); h.score = p.s * 10 + toolRank(p.t) * 3 + (h.fits ? 50 : 0) + (p.m.featured ? 1 : 0) - (p.m.rank ?? 50) / 100; return h; });
  return hits.sort((a, b) => b.score - a.score).slice(0, max);
}

/** describe {id, model}: the tool's field schema narrowed to one model (its modes, lengths, resolutions) with that model's defaults. */
export function narrowSchema(schema: any, lim: ModelLimits | null): any {
  if (!lim) return schema; const out = JSON.parse(JSON.stringify(schema)); const p = out.properties ?? {};
  if (p.types && lim.modes?.length) { const it = p.types.items ?? p.types; if (Array.isArray(it.enum)) it.enum = it.enum.filter((x: string) => lim.modes!.includes(x)); else it.enum = lim.modes; }
  if (p.duration) { const list = lim.durations?.length ? lim.durations : lim.minSeconds != null && lim.maxSeconds != null ? Array.from({ length: Math.round(lim.maxSeconds - lim.minSeconds) + 1 }, (_, i) => lim.minSeconds! + i) : null;
    if (list) { p.duration.enum = list.map(String); const d = lim.defaultSeconds != null && list.includes(lim.defaultSeconds) ? lim.defaultSeconds : list.includes(5) ? 5 : list[0]; p.duration.default = String(d);
      p.duration.description = `${p.duration.description ? `${p.duration.description}. ` : ''}This model: ${lim.minSeconds ?? list[0]}–${lim.maxSeconds ?? list.at(-1)} s.`; } }
  if (p.resolution && lim.resolutions?.length) { p.resolution.enum = lim.resolutions; p.resolution.default = lim.defaultResolution && lim.resolutions.includes(lim.defaultResolution) ? lim.defaultResolution : lim.resolutions[0]; }
  return out;
}
