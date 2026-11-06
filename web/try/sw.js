// Try it (try.iiayn.app): the app's server, played back inside the browser. This service worker answers every request the real
// web app makes to its own server: GET /api/* from _try/snap.json (recorded from a MOCK server by scripts/try/record.mjs), media from
// _try/m/ (copied by scripts/try/build.mjs) or the app's own public files, and the few writes a visitor makes with small fakes (a Generate
// becomes a sample job that goes queued -> running -> done with an example result; an upload stays in this browser). Nothing leaves the
// browser and nothing is generated.
// SPDX-License-Identifier: AGPL-3.0-or-later
const DATA = '/_try/'; // snap.json, m/ (media) and the visitor's own state
const VOLATILE = new Set(['_', 't', 'ts', 'now', 'cb', 'v', 'since', 'after', 'nonce']); // same list as scripts/try/record.mjs
const APP_PATHS = /^\/(api|files|samples|s)\//; // the app's server; everything else is a static file (web/public, the built app)
const SAMPLE_REASON = 'Sample · real runs need the app on your computer.'; // = SAMPLE_OUTPUT in web/src/shared/sampleSite.ts
const NOT_HERE = 'This needs the app on your computer. Here you can click through it and make samples.'; // = NEEDS_APP in sampleSite.ts
const DOWNLOADS = 'Downloads run in the app on your computer.';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(caches.delete('try-media').then(() => self.clients.claim()))); // a new deploy: media cut for ranges is fetched again

let snapP = null;
/** snap.json once per worker: routes {key: {s, t, b}}, templates {toolId: job}, media {url: file}, plus indexes built here. */
function snap() {
  if (!snapP) snapP = fetch(DATA + 'snap.json').then(r => r.json()).then(s => {
    s.byPath = {}; for (const k of Object.keys(s.routes)) { const p = k.split('?')[0]; (s.byPath[p] ??= []).push(k); }
    s.jobs = {}; // every job seen in a recorded list, by id (for /api/jobs/:id and ?ids=)
    for (const k of s.byPath['GET /api/jobs'] ?? []) { try { const b = JSON.parse(s.routes[k].b); for (const j of (Array.isArray(b) ? b : b.items ?? [])) if (j?.id) s.jobs[j.id] ??= j; } catch { /* not a list */ } }
    return s;
  });
  return snapP;
}

// ---- the visitor's own sample runs: kept in memory and in Cache Storage, so a reload or a sleeping worker keeps them ----
const STATE = DATA + '__state.json'; let mine = null, routing = null, boards = null, uploads = null; // routing: the visitor's Run on choices ({tool: {model: {runOn, route}}}); boards: their Canvas boards
async function load() { if (mine) return; try { const r = await (await caches.open('try-state')).match(STATE); const st = r ? await r.json() : {}; mine = st.jobs ?? []; routing = st.routing ?? {}; boards = st.boards ?? []; uploads = st.uploads ?? []; } catch { mine = []; routing = {}; boards = []; uploads = []; } }
async function myJobs() { await load(); return mine; }
async function save() { try { await (await caches.open('try-state')).put(STATE, new Response(JSON.stringify({ jobs: mine, routing, boards, uploads }), { headers: { 'content-type': 'application/json' } })); } catch { /* private window */ } }
const QUEUED_MS = 400, RUN_MS = 2200; // quick, but long enough to see the queue and the progress the app shows
/** A sample job's state follows the clock: queued, then running with progress, then done. */
function live(j) {
  const age = Date.now() - j.startedAt; if (j.status === 'canceled') return j;
  if (age < QUEUED_MS) return { ...j, status: 'queued', state: 'queued', stage: 'queued', progress: 0, percent: 0, queuePos: 1, eta: Math.ceil((QUEUED_MS + RUN_MS) / 1000), outputs: [], resultUrl: null };
  if (age < QUEUED_MS + RUN_MS) { const pct = Math.round(((age - QUEUED_MS) / RUN_MS) * 100);
    return { ...j, status: 'running', state: 'running', stage: 'generating', progress: pct, percent: pct, queuePos: 0, eta: Math.ceil((QUEUED_MS + RUN_MS - age) / 1000), progressInfo: { stage: 'generating', percent: pct, source: 'sample' }, outputs: [], resultUrl: null }; }
  return j;
}

const json = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'x-sample-mode': '1', ...extra } });
const keyOf = (method, url) => { const q = [...url.searchParams].filter(([k]) => !VOLATILE.has(k)).sort(([a, x], [b, y]) => a < b ? -1 : a > b ? 1 : x < y ? -1 : 1);
  return `${method} ${url.pathname}${q.length ? '?' + new URLSearchParams(q).toString() : ''}`; };

/** The recorded answer for this request: the exact query, else the recorded query on the same path that shares the most settings
 *  (the model and where it runs count most, so a price stays the price of the model the visitor picked). */
function lookup(s, method, url) {
  const exact = s.routes[keyOf(method, url)]; if (exact) return exact;
  const cands = s.byPath[`${method} ${url.pathname}`]; if (!cands?.length) return null;
  const want = new URLSearchParams(keyOf(method, url).split('?')[1] ?? ''); const HEAVY = new Set(['provider', 'model', 'runOn', 'toolId', 'workflow', 'section', 'media', 'kind']);
  let best = null, bestScore = -1;
  for (const k of cands) { const have = new URLSearchParams(k.split('?')[1] ?? ''); let score = 0;
    for (const [n, v] of want) if (have.get(n) === v) score += HEAVY.has(n) ? 10 : 1; else if (HEAVY.has(n) && have.has(n)) score -= 10;
    if (score > bestScore) { best = k; bestScore = score; } }
  return s.routes[best];
}
const answer = (r) => new Response(r.b, { status: r.s, headers: { 'content-type': r.t || 'application/json', 'x-sample-mode': '1' } });

/** Canvas: the visitor's boards live in this browser (create, open, rename, save). A board's side panels (spend, agent feed, proposals)
 *  answer what the recorded board answered, with the id swapped. */
async function canvas(s, req, url) {
  const m = req.method; const parts = url.pathname.split('/').slice(4).map(decodeURIComponent); const [id, sub] = [parts[0], parts.slice(1).join('/')];
  const body = async () => { try { return await req.clone().json(); } catch { return {}; } };
  const summary = ({ snapshot, ...b }) => b;
  if (!id) {
    if (m === 'GET') return json({ items: boards.map(summary) });
    if (m === 'POST') { const b = await body(); const now = Date.now(); const board = { id: 'brd_try' + Math.random().toString(36).slice(2, 12), name: b.name || `Untitled board ${boards.length + 1}`, createdAt: now, updatedAt: now, rev: 0, shapes: 0, projectId: null, snapshot: null };
      boards.unshift(board); await save(); return json(board, 201); }
    return null;
  }
  const board = boards.find(b => b.id === id);
  if (!sub) {
    if (!board) return json({ error: 'Board not found', code: 'not_found' }, 404);
    if (m === 'GET') return json(board);
    if (m === 'DELETE') { boards = boards.filter(b => b !== board); await save(); return json({ ok: true }); }
    const b = await body(); if (m === 'PATCH') { if ('name' in b) board.name = String(b.name); if ('projectId' in b) board.projectId = b.projectId; }
    if (m === 'PUT') { board.snapshot = b.snapshot ?? null; board.rev++; board.shapes = Object.keys(b.snapshot?.store ?? {}).filter(k => k.startsWith('shape:')).length; }
    board.updatedAt = Date.now(); await save(); return json(m === 'PUT' ? { id, rev: board.rev, updatedAt: board.updatedAt, shapes: board.shapes } : summary(board));
  }
  if (sub === 'save' && m === 'POST' && board) { const b = await body(); board.snapshot = b.snapshot ?? board.snapshot; board.rev++; board.updatedAt = Date.now(); await save(); return json({ id, rev: board.rev }); }
  if (m === 'GET') { const rec = Object.keys(s.routes).find(k => k.startsWith('GET /api/canvas/boards/') && k.slice(4).split('?')[0].split('/').slice(5).join('/') === sub);
    if (rec) { const old = rec.split('/')[4]; const r = s.routes[rec]; return new Response(r.b.split(old).join(id), { status: r.s, headers: { 'content-type': r.t, 'x-sample-mode': '1' } }); } }
  return null;
}

/** Each tool's kind of result (image, video, audio, 3d) and its models, from the recorded tool registry. */
function mediaOf(s) { if (s.mediaOf) return; s.mediaOf = {}; s.toolOf = {}; try { const t = JSON.parse(s.routes['GET /api/tools']?.b ?? '[]'); for (const x of (Array.isArray(t) ? t : t.tools ?? [])) { s.mediaOf[x.id] = x.media; s.toolOf[x.id] = x; } } catch { /* no registry */ } }

// ---- which example a sample run shows: one of the app's own example results that looks like an answer to the prompt ----
/** Tools that make anything from a prompt: their sample is picked from samples.json by the prompt's words. Every other tool (a workflow:
 *  Relight, Upscale, Extend…) shows its own recorded example result, which is what that workflow makes. */
const GENERIC = new Set(['create-image', 'h3-video', 'audio', 'three-d']);
const PERSON = /\b(wom[ae]n|m[ae]n|girls?|boys?|guys?|lady|ladies|person|people|portrait|selfie|face|faces|actor|actress|kid|kids|child|children|grandpa|grandma|grandfather|grandmother|fisherman|sailor|painter|artist|friends?|couple|family|ghost|horror)\b/i;
const words = (t) => String(t ?? '').toLowerCase().replace(/colou?r/g, 'colour').split(/[^a-z0-9]+/).filter(w => w.length > 2)
  .flatMap(w => [w, w.replace(/(ies)$/, 'y').replace(/(es|s)$/, '')]);
/** The best example of this kind for the prompt: most shared words (the prompt counts 3, the workflow's name 1); a person only for a prompt
 *  that asks for one; no match → one of the kind's defaults, the same one for the same prompt. */
/** The examples of a kind that fit the run (its types; a person only for a prompt that asks for one). */
function sampleList(s, kind, prompt, types) {
  let list = s.samples?.[kind] ?? []; if (types?.length) { const t = list.filter(x => !x.types || x.types.some(y => types.includes(y))); if (t.length) list = t; }
  return PERSON.test(prompt ?? '') ? list : list.filter(x => !x.person);
}
function pickSample(s, kind, prompt, extra, types) {
  const list = sampleList(s, kind, prompt, types); if (!list.length) return null;
  return pickSamples(list, prompt, extra, 1)[0];
}
/** The n best examples of a list for the prompt (count 2–4 on Image): the best match first, then the next best, then the defaults
 *  and the rest in an order fixed by the prompt, never the same example twice. */
function pickSamples(list, prompt, extra, n) {
  const pw = new Set(words(prompt)), ew = new Set(words(extra)); let h = 0; for (const c of String(prompt ?? '')) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const scored = list.map((x, i) => { const tw = new Set(words(x.tags)); let sc = 0; for (const w of tw) sc += (pw.has(w) ? 3 : 0) + (ew.has(w) ? 1 : 0);
    return { x, sc, d: x.default ? 1 : 0, r: ((i * 2654435761 + h) >>> 0) % 9973 }; });
  scored.sort((a, b) => b.sc - a.sc || b.d - a.d || a.r - b.r);
  if (!scored[0]?.sc) { const defs = scored.filter(y => y.d); const pool = defs.length ? defs : scored; const first = pool[h % pool.length]; scored.splice(scored.indexOf(first), 1); scored.unshift(first); }
  return scored.slice(0, Math.max(1, n)).map(y => y.x);
}
const outputOf = (x, kind) => kind === 'video' ? { kind: 'video', url: x.url, posterUrl: x.poster ?? null, width: x.w, height: x.h, durationSec: x.sec, hasAudio: !!x.audio, label: 'Result', sample: null }
  : kind === 'audio' ? { kind: 'audio', url: x.url, posterUrl: null, width: null, height: null, durationSec: x.sec, label: 'Result', sample: null }
  : kind === '3d' ? { kind: '3d', url: x.url, posterUrl: x.poster ?? null, width: null, height: null, durationSec: null, label: '3D model', sample: null }
  : { kind: 'image', url: x.url, posterUrl: x.url, width: x.w, height: x.h, durationSec: null, label: 'Result', sample: null };
/** The model the visitor picked (its engine id, else its key) on this tool: {key, name, runOn label}. */
function modelOf(s, toolId, fields) { const t = s.toolOf?.[toolId]; const ms = t?.models ?? [];
  const m = ms.find(x => x.key === fields.model) ?? ms.find(x => (x.engines ?? []).includes(fields.provider)) ?? null; if (!m) return null;
  const runOn = fields.runOn || routing?.[toolId]?.[m.key]?.runOn || m.preselect?.runOn || m.autoRunOn || null; const row = (m.runsOn ?? []).find(r => r.id === runOn);
  return { key: m.key, name: m.displayName || m.name, engine: (fields.provider && (m.engines ?? []).includes(fields.provider)) ? fields.provider : m.primaryEngine ?? m.engines?.[0], runOn, runOnLabel: row?.label ?? null }; }

const prompt0 = (f) => String(f.prompt ?? '').trim();
/** A Generate: a sample job that shows an example result (see pickSample), with the model, prompt and settings the visitor chose, marked as a sample. */
async function createJob(s, toolId, req) {
  let fields = {}; try { const fd = await req.formData(); for (const [k, v] of fd) if (typeof v === 'string') fields[k] = v; } catch { /* no form */ }
  mediaOf(s);
  const done = (j) => j?.status === 'done' && j.outputs?.length && !/^\/files\//.test(j.outputs[0].url ?? '/files/');
  const kind = s.mediaOf[toolId] ?? 'image';
  let types = []; try { const t = JSON.parse(fields.types ?? '[]'); types = Array.isArray(t) ? t.map(String) : [String(t)]; } catch { types = String(fields.types ?? '').split(',').filter(Boolean); }
  // the shape of a finished job (fields the viewer reads) from a recorded one; the example and everything the visitor chose go on top
  // Recreate (the same prompt as an example of this kind): that example's own result; else a workflow's own example
  const again = prompt0(fields) && Object.values(s.jobs).find(j => done(j) && s.mediaOf[j.toolId] === kind && String(j.input?.prompt ?? '').trim() === prompt0(fields));
  const own = again || (!GENERIC.has(toolId) ? Object.values(s.jobs).find(j => j.toolId === toolId && done(j)) : null);
  const shape = own ?? s.templates[toolId] ?? Object.values(s.templates).find(j => s.mediaOf[j.toolId] === kind) ?? Object.values(s.jobs).find(j => s.mediaOf[j.toolId] === kind && done(j)) ?? s.templates['create-image'] ?? Object.values(s.templates)[0];
  if (!shape) return json({ error: NOT_HERE, code: 'sample_mode' }, 400);
  const t = s.toolOf?.[toolId]; const prompt = fields.prompt ?? '';
  const pick = own ? null : pickSample(s, kind === 'audio' && toolId !== 'audio' && toolId !== 'soundtrack' ? 'audio' : kind, prompt, `${t?.name ?? ''} ${toolId.replace(/^app-/, '').replace(/-/g, ' ')}`, types);
  const n = kind === 'image' ? Math.min(4, Math.max(1, Number(fields.n) || 1)) : 1; // count: that many results, as the app makes
  const picks = !own && pick && n > 1 ? pickSamples(sampleList(s, 'image', prompt, types), prompt, `${t?.name ?? ''} ${toolId.replace(/^app-/, '').replace(/-/g, ' ')}`, n) : null;
  const outputs = own ? own.outputs : picks ? picks.map(x => outputOf(x, kind)) : pick ? [outputOf(pick, kind)] : shape.outputs;
  const m = modelOf(s, toolId, fields);
  const id = 'try' + Math.random().toString(36).slice(2, 10); const now = Date.now(); const iso = (ms) => new Date(ms).toISOString();
  const job = { ...shape, id, toolId, startedAt: now, createdAt: iso(now), updatedAt: iso(now), finishedAt: iso(now + QUEUED_MS + RUN_MS),
    ...(m ? { provider: m.engine, modelKey: m.key, model: m.name, modelName: m.name, runOn: m.runOn, runOnLabel: m.runOnLabel,
      feature: { ...(shape.feature ?? {}), id: toolId, name: t?.name ?? shape.feature?.name, model: m.name, label: `${t?.name ?? shape.feature?.name ?? ''} · ${m.name}` } } : {}),
    prompt, input: { ...(own?.input ?? {}), ...fields, prompt, types }, params: { ...fields }, caption: null,
    outputs, resultUrl: outputs[0]?.url ?? null, posterUrl: outputs[0]?.posterUrl ?? null, layersPosterUrl: own?.layersPosterUrl ?? null,
    threeD: kind === '3d' && outputs[0]?.posterUrl ? { posterUrl: outputs[0].posterUrl, posterV: 2 } : own?.threeD ?? null,
    status: 'done', state: 'done', stage: 'done', progress: 100, percent: 100, progressInfo: { stage: 'done', percent: 100, source: 'sample' }, error: null, errorType: null,
    isSample: true, sampleReason: SAMPLE_REASON, sampleLabel: 'Sample', sample: null, demo: true, demoMessage: SAMPLE_REASON, demoNotice: null, featured: false, featuredExample: false, example: false,
    cost: 0, actualCost: null, actualUsd: null, free: true, favourite: false, trashed: false, deletedAt: null, projectId: null, warnings: [], diagnostics: [], fallback: null };
  const list = await myJobs(); list.unshift(job); await save();
  return json({ id, provider: job.provider, warnings: [SAMPLE_REASON], cost: 0, free: true, balance: 0, seed: job.seed ?? 1, sample: true });
}

/** Lists (/api/jobs, /api/assets): the visitor's sample runs on top of the recorded first page. */
async function withMine(s, r, url) {
  const list = (await myJobs()).filter(j => j.status !== 'trashed'); if (!list.length) return answer(r);
  const q = url.searchParams; const first = !q.get('cursor'); mediaOf(s);
  // the same filters the server applies: a tool, a kind (media, the Image / Video / Audio feeds), favourites
  const kind = q.get('media') ?? (q.has('imageFeed') || q.has('features') ? 'image' : q.has('videoFeed') ? 'video' : q.has('audioFeed') ? 'audio' : null);
  const tools = q.get('toolId')?.split(',');
  const extra = list.filter(j => (!tools || tools.includes(j.toolId)) && (!kind || s.mediaOf[j.toolId] === kind) && (!q.has('liked') && q.get('section') !== 'favourites' || j.favourite)
    && q.get('section') !== 'trash').map(live)
    .filter(j => (!q.get('status') || q.get('status').split(',').includes(j.status)) && (q.get('state') !== 'active' || j.status === 'queued' || j.status === 'running'));
  if (!first || !extra.length) return answer(r);
  try { const b = JSON.parse(r.b);
    if (Array.isArray(b)) return json([...extra, ...b], r.s);
    if (Array.isArray(b.items)) return json({ ...b, items: [...extra, ...b.items], total: (b.total ?? b.items.length) + extra.length }, r.s);
  } catch { /* not json */ }
  return answer(r);
}


// ---- prices: the grid (scripts/try/priceGrid.mjs) answers the studios' price queries for any model, place, length and size ----
/** The same function as cellKey in scripts/try/priceGrid.mjs (spec.dims is the list of its dims here). */
const cellKey = (tool, model, runOn, route, spec, q) => [tool, model, runOn ?? '', route ?? '', ...spec.dims.map(d => q[d] ?? spec.base[d] ?? '')].join('|');
const usd = (c) => `$${(c / 100).toFixed(2)}`;
/** A price answer at other credits: every price field scaled to them (credits, list price, the cost card, the $ in the words). */
function rescale(b, c1) {
  const c0 = b.credits; if (typeof c0 !== 'number' || c0 === c1) return b; const k = c0 > 0 ? c1 / c0 : null;
  const sc = (v, d = 0) => typeof v === 'number' && k != null ? Number((v * k).toFixed(d)) : v;
  const words = (t) => typeof t === 'string' ? t.replace(/\$\d[\d,]*(\.\d+)?/g, () => usd(c1)) /* a function: "$1.38" as a replacement string would read $1 as a group */ : t;
  const out = { ...b, credits: c1, listCredits: typeof b.listCredits === 'number' ? (b.listCredits === c0 ? c1 : sc(b.listCredits)) : b.listCredits, gpuSec: sc(b.gpuSec), draftCredits: sc(b.draftCredits), exactUsd: sc(b.exactUsd, 4), priceLine: words(b.priceLine),
    breakdown: Array.isArray(b.breakdown) ? b.breakdown.map(x => ({ ...x, label: words(x.label) })) : b.breakdown };
  if (b.cost && typeof b.cost === 'object') { const units = sc(b.cost.estUnits);
    out.cost = { ...b.cost, estUsd: typeof b.cost.estUsd === 'number' && b.cost.estUsd > 0 ? Number((c1 / 100).toFixed(2)) : b.cost.estUsd, realRunUsd: typeof b.cost.realRunUsd === 'number' ? Number((c1 / 100).toFixed(2)) : b.cost.realRunUsd, estUnits: units,
      usdText: words(b.cost.usdText), detail: typeof b.cost.detail === 'string' && typeof units === 'number' ? b.cost.detail.replace(/^\d[\d,]*/, String(units)) : b.cost.detail }; }
  return out;
}
/** A place that only answers samples here (a mock key): shown at its list price, what the app charges with a real key. */
function priced(b) {
  if (!b?.demo || typeof b.listCredits !== 'number' || b.listCredits <= 0) return b;
  const c = b.listCredits; const out = { ...b, credits: c, demo: false, chargeable: true, demoMessage: null, demoNotice: null, priceLine: `≈ ${usd(c)}` }; delete out.demoTag;
  if (b.cost) out.cost = { ...b.cost, demo: false, estUsd: Number((c / 100).toFixed(2)), realRunUsd: Number((c / 100).toFixed(2)), usdText: `≈ ${usd(c)}` };
  return out;
}
/** The price of one setup on a studio from the grid: {s, b} (b parsed), or null when the grid doesn't cover it (then the recorded answers do). */
function priceFor(s, toolId, q) {
  const g = s.grid; const sp = g?.spec?.[toolId]; if (!sp) return null; mediaOf(s);
  const ms = s.toolOf?.[toolId]?.models ?? []; const engine = sp.engineParam === 'model' ? q.model : q.provider;
  const m = ms.find(x => x.key === q.model) ?? ms.find(x => (x.engines ?? []).includes(engine)) ?? (sp.engineParam === 'model' ? null : ms.find(x => x.isDefault)); if (!m) return null;
  const saved = routing?.[toolId]?.[m.key];
  const byEngine = (m.runsOn ?? []).filter(r => (r.engines ?? []).includes(engine)); // an engine that runs in one place only names the place (the server routes it there)
  const own = engine === (m.primaryEngine ?? m.engines?.[0]); // no place asked or saved: the server's own pick for these settings ('' in the grid)
  const runOn = q.runOn || (saved?.runOn && saved.runOn !== 'auto' ? saved.runOn : null) || (!own && byEngine.length === 1 ? byEngine[0].id : '');
  const asked = q.route || (runOn && saved?.runOn === runOn ? saved.route : null) || '';
  // a route names its engine after the colon: the server prices the engine the page asks for, so a saved route of another engine is not used
  const want = asked && engine && asked.includes(':') && asked.split(':').slice(1).join(':') !== engine ? '' : asked;
  const combo = [want, ''].map(r => `${toolId}|${m.key}|${runOn}|${r}`).find(k => g.tpl[k]); if (!combo) return null; const route = combo.split('|')[3];
  let key = cellKey(toolId, m.key, runOn, route, sp, q);
  if (!(key in g.cells)) { const q2 = { ...q }; // a length the model doesn't make: the nearest it does (the server snaps the same way)
    for (const d of sp.dims) { const v = String(q2[d] ?? ''); if (!/^\d+(\.\d+)?$/.test(v) || cellKey(toolId, m.key, runOn, route, sp, q2) in g.cells) continue; const n = Math.round(Number(v));
      for (let o = 0; o <= 600; o++) { const hit = [n - o, n + o].find(x => x > 0 && cellKey(toolId, m.key, runOn, route, sp, { ...q2, [d]: String(x) }) in g.cells); if (hit) { q2[d] = String(hit); break; } } }
    key = cellKey(toolId, m.key, runOn, route, sp, q2);
    for (const d of sp.dims) if (!(key in g.cells)) { delete q2[d]; key = cellKey(toolId, m.key, runOn, route, sp, q2); } }
  const cell = g.cells[key]; if (cell == null) return null;
  if (typeof cell === 'string') { const e = g.errs[Number(cell.slice(1))]; let b = {}; try { b = JSON.parse(e.b); } catch { /* text */ } return { s: e.s, b }; }
  let c = cell; const f = g.factors[combo] ?? {};
  for (const [p, vs] of Object.entries(sp.factors ?? {})) { const v = q[p]; if (v != null && vs.includes(String(v)) && f[`${p}=${v}`] != null) c *= f[`${p}=${v}`]; }
  for (const p of sp.linear ?? []) { const n = Number(q[p]); if (n > 1) c *= n; }
  c = Math.round(c); let b = priced(JSON.parse(g.tpl[combo]));
  return { s: 200, b: rescale(b, c) };
}
const ROW_FIELDS = ['status', 'credits', 'listCredits', 'chargeable', 'free', 'local', 'demo', 'runnable', 'needsKey', 'priceAvailable', 'cost', 'billingMode', 'runOn', 'runOnLabel', 'place', 'placeLabel', 'routeId', 'routeKind', 'modelKey', 'perSecond', 'eta', 'localRun', 'priceRef', 'upTo'];
const rowOf = (r) => r.s < 400 ? Object.fromEntries([['status', r.s], ...ROW_FIELDS.slice(1).filter(k => k in r.b).map(k => [k, r.b[k]])]) : { status: r.s, code: r.b.code ?? r.b.errorType ?? null, issues: r.b.issues ?? null, error: r.b.error ?? null };
const toolOfPath = (p, url) => { const m = p.match(/^\/api\/tools\/([^/]+)\/price(-variants)?$/); return m ? decodeURIComponent(m[1]) : p === '/api/models/quote' || p === '/api/models/quotes' ? (url.searchParams.get('toolId') || 'create-image') : null; };
/** POST /api/tools/:id/price-variants: each option's price (the bar's popups). */
function variantsFor(s, toolId, body) {
  const base = body.params ?? {}; const out = {};
  for (const [id, ov] of Object.entries(body.variants ?? {})) { const q = { ...base }; for (const [k, v] of Object.entries(ov ?? {})) { if (v == null) delete q[k]; else q[k] = String(v); }
    const r = priceFor(s, toolId, q); out[id] = r ? rowOf(r) : null; }
  return { toolId, base, variants: out };
}
/** POST /api/models/quotes: every model's price at these settings (the model picker), with the range over the places that can run it. */
function quotesFor(s, body) {
  const toolId = body.toolId || 'create-image'; const sp = s.grid?.spec?.[toolId]; if (!sp) return null; mediaOf(s);
  const ms = s.toolOf?.[toolId]?.models ?? []; const asked = (body.models?.length ? body.models : ms.map(m => ({ model: m.key }))).map(x => typeof x === 'string' ? { model: x } : x);
  const quotes = {};
  for (const a of asked) { const m = ms.find(x => x.key === a.model); if (!m) continue; const ident = sp.engineParam === 'model' ? { model: m.primaryEngine ?? m.engines?.[0] } : { model: m.key, provider: m.primaryEngine ?? m.engines?.[0] };
    const q = { ...(body.params ?? {}), ...ident, ...(a.runOn && a.runOn !== 'auto' ? { runOn: a.runOn } : {}) }; const r = priceFor(s, toolId, q);
    if (!r) continue; const places = []; for (const row of m.runsOn ?? []) { if (row.status !== 'ready' && row.status !== 'sample') continue; const x = priceFor(s, toolId, { ...q, runOn: row.id, model: sp.engineParam === 'model' ? (row.engines?.[0] ?? ident.model) : m.key, provider: row.engines?.[0] ?? ident.provider });
      if (x && x.s < 400 && typeof x.b.credits === 'number') places.push({ runOn: row.id, runOnLabel: row.label, placeLabel: x.b.placeLabel ?? row.label, credits: x.b.credits, cost: x.b.cost ?? null, routeId: x.b.routeId ?? null }); }
    const cs = places.map(p => p.credits); const range = cs.length ? { min: Math.min(...cs), max: Math.max(...cs), minUsd: Math.min(...cs) / 100, maxUsd: Math.max(...cs) / 100, places } : null;
    quotes[m.key] = { model: m.key, ok: r.s < 400, ...rowOf(r), priceRange: range }; }
  return { toolId, params: body.params ?? {}, quotes };
}

/** Same rule as scripts/try/record.mjs withRoute: a price is looked up with the saved Run on route of its tool + model first. */
function withRoute(url) { const m = url.pathname.match(/^\/api\/tools\/([^/]+)\/price$/); const r = m && routing?.[decodeURIComponent(m[1])]?.[url.searchParams.get('model') ?? '']?.route;
  if (!r) return null; const u = new URL(url); u.searchParams.set('__route', r); return u; }

/** A live-updates stream (SSE) that stays open and says nothing new: closing it would make the page reconnect and say the connection
 *  dropped. A Canvas board's stream first says hello (no agent connected, no demo running), as the app's server does. */
function quietStream(p) {
  const board = p.match(/^\/api\/canvas\/boards\/([^/]+)\/agent\/stream$/); const enc = new TextEncoder(); let t = null;
  const body = new ReadableStream({ start(c) { c.enqueue(enc.encode(board ? `event: hello\ndata: ${JSON.stringify({ boardId: decodeURIComponent(board[1]), canvasOpen: true, agent: null, demo: null, pick: null, lastSeq: 0, proposals: [] })}\n\n` : ': sample mode\n\n'));
    t = setInterval(() => { try { c.enqueue(enc.encode(': ping\n\n')); } catch { clearInterval(t); } }, 25000); }, cancel() { clearInterval(t); } });
  return new Response(body, { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', 'x-sample-mode': '1' } });
}
async function api(req, url) {
  const s = await snap(); await load(); const m = req.method; const p = url.pathname;
  let mm;
  if (p === '/api/me/routing' && (m === 'PUT' || m === 'GET')) {
    if (m === 'PUT') { try { const b = await req.json(); for (const [t, ms] of Object.entries(b.perTool ?? {})) routing[t] = { ...(routing[t] ?? {}), ...ms }; await save(); } catch { /* not json */ } }
    let base = {}; try { base = JSON.parse(s.routes['GET /api/me/routing']?.b ?? '{}'); } catch { /* none */ }
    return json({ ...base, perTool: { ...(base.perTool ?? {}), ...routing } }); }
  if (p.startsWith('/api/canvas/boards')) { const r = await canvas(s, req, url); if (r) return r; }
  if (m === 'POST' && /^\/api\/(models\/quotes|tools\/[^/]+\/price-variants)$/.test(p)) { let body = {}; try { body = await req.clone().json(); } catch { /* not json */ }
    const g = p === '/api/models/quotes' ? quotesFor(s, body) : s.grid?.spec?.[toolOfPath(p, url)] ? variantsFor(s, toolOfPath(p, url), body) : null; if (g) return json(g);
    let tool = body.toolId ?? '';
    const r = lookup(s, 'POST', new URL(`${p}?toolId=${encodeURIComponent(tool || p.split('/')[3])}`, url)); if (r) return answer(r); }
  if (m === 'POST' && (mm = p.match(/^\/api\/tools\/([^/]+)\/jobs$/))) return createJob(s, decodeURIComponent(mm[1]), req);
  // the checks before a run (a picture's size, format…): nothing to warn about in sample mode
  if (m === 'POST' && p === '/api/precheck') return json({ ok: true, blocking: false, warnings: [], checks: {} });
  // model downloads: a dry run says it can't start here (the app's own "can't download" line), the download itself is refused
  if (m === 'GET' && p === '/api/local/comfy' && !s.routes['GET /api/local/comfy']) return json({ url: null, source: null, savedUrl: null, serverDefault: null, cloud: false, canChange: false, sample: true });
  if (m === 'GET' && p === '/api/local/downloads' && !s.routes['GET /api/local/downloads']) return json({ downloads: [], modelsDir: null, modelsDirSet: false, sample: true });
  if (m === 'POST' && p === '/api/local/downloads') { let b = {}; try { b = await req.clone().json(); } catch { /* not json */ }
    return b.dryRun ? json({ dryRun: true, canDownload: false, code: 'sample_mode', error: DOWNLOADS, missingBytes: 0, files: [] }) : json({ error: DOWNLOADS, code: 'sample_mode', sample: true }, 400); }
  // Recreate / See the workflow on a visitor's sample run: the same answer as an example of that tool, with this run's id and settings
  if (m === 'GET' && (mm = p.match(/^\/api\/jobs\/(try[^/]+)\/(prefill|workflow)$/))) { const j = (await myJobs()).find(x => x.id === mm[1]);
    const rec = j && Object.keys(s.routes).find(k => k.startsWith(`GET /api/jobs/`) && k.split('?')[0].endsWith(`/${mm[2]}`) && (() => { try { return JSON.parse(s.routes[k].b).tool === j.toolId || JSON.parse(s.routes[k].b).toolId === j.toolId; } catch { return false; } })());
    if (j && rec) { const old = rec.split('/')[3]; const b = JSON.parse(s.routes[rec].b.split(old).join(j.id));
      if (mm[2] === 'prefill') { const f = Object.fromEntries(Object.entries(j.params ?? {}).filter(([k]) => !/^(quoted|origin|client)/.test(k))); Object.assign(b, { model: j.provider ?? b.model, modelKey: j.modelKey ?? b.modelKey, fields: f, form: f, files: {}, missingFiles: [], seed: null, sameSeed: false, originalSeed: j.seed ?? null }); if (b.output) b.output = { ...b.output, url: j.outputs?.[0]?.url ?? b.output.url }; }
      else { b.notes = ['This result is a sample, so nothing ran yet. Install the app to run it.']; }
      return json(b); } }
  if ((mm = p.match(/^\/api\/jobs\/([^/]+)$/)) && m === 'GET') { const j = (await myJobs()).find(x => x.id === mm[1]); if (j) return json(live(j)); if (s.jobs[mm[1]]) return json(s.jobs[mm[1]]); }
  if (p === '/api/jobs' && m === 'GET' && url.searchParams.has('ids')) { const ids = url.searchParams.get('ids').split(','); const my = await myJobs();
    return json(ids.map(id => { const j = my.find(x => x.id === id); return j ? live(j) : s.jobs[id]; }).filter(Boolean)); }
  if ((mm = p.match(/^\/api\/jobs\/([^/]+)\/(cancel|favourite|project|restore|visibility)$/)) && m !== 'GET') { const my = await myJobs(); const j = my.find(x => x.id === mm[1]);
    if (j && mm[2] === 'cancel') { j.status = j.state = 'canceled'; await save(); } if (j && mm[2] === 'favourite') { j.favourite = !j.favourite; await save(); }
    return json({ ok: true, sample: true, ...(j ? live(j) : {}) }); }
  if ((mm = p.match(/^\/api\/jobs\/([^/]+)$/)) && m === 'DELETE') { mine = (await myJobs()).filter(x => x.id !== mm[1]); await save(); return json({ ok: true, sample: true }); }
  if (m === 'GET' && /^\/api\/(tools\/[^/]+\/price|models\/quote)$/.test(p)) { const r = priceFor(s, toolOfPath(p, url), Object.fromEntries(url.searchParams)); if (r) return json(r.b, r.s); }
  if (m === 'GET') {
    const ru = withRoute(url); const r = (ru && s.routes[keyOf('GET', ru)]) || lookup(s, 'GET', url);
    if (r) return (p === '/api/jobs' || p === '/api/assets') ? withMine(s, r, url) : answer(r);
    if (/\/(stream|events)$/.test(p)) return quietStream(p);
    return json({ error: NOT_HERE, errorType: 'not_found', code: 'sample_mode', sample: true }, 404);
  }
  // writes: a recorded answer for the same route (prices for every model, a new board), else a friendly "needs the app"
  if (/\/price(-variants)?$|\/quote$|\/precheck$|\/validate$|\/resolve$/.test(p)) { const r = lookup(s, m, url) ?? lookup(s, m, new URL(p, url)); if (r) return answer(r); }
  const r = s.routes[`${m} ${p}`]; if (r) return answer(r);
  if (m === 'PUT' || m === 'PATCH') return json({ ok: true, sample: true }); // settings and preferences: accepted for this visit only
  return json({ error: NOT_HERE, code: 'sample_mode', errorType: 'sample_mode', sample: true }, 400);
}

/** Media the pages load (the mock's /files and /samples, posters, thumbnails): the copy in _try/m/, by full URL, then by path. A value that
 *  starts with '/' is one of the app's own public files (web/public), served as it is. */
/** A thumbnail or poster we never recorded at this size: the same picture at another size, else the picture it was made from. */
/** A layered job's composite poster (GET /api/jobs/:id/layers-poster.png redirects there in the app): /files/<id>-layers.png. */
const alias = (p) => { const m = p.match(/^\/api\/jobs\/([^/]+)\/layers-poster\.png$/); return m ? `/files/${m[1]}-layers.png` : p; };
function findMedia(s, url, depth = 0) {
  const p = alias(url.pathname); const plain = [...url.searchParams.keys()].every(k => k === 'clean' || VOLATILE.has(k)); // ?clean=1: the same file
  const f = s.media[url.pathname + url.search] ?? (plain ? s.media[p] : null); if (f) return f;
  if (depth > 0 && !APP_PATHS.test(p)) return p; // a public file the recording never loaded: it is on the site all the same
  if (!/^\/api\/media\/(thumb|poster)$/.test(url.pathname) || depth > 3) return s.media[p] ?? null;
  const inner = url.searchParams.get('url'); if (!inner) return null;
  const same = Object.keys(s.media).find(k => k.startsWith(url.pathname + '?') && new URL(k, url).searchParams.get('url') === inner); if (same) return s.media[same];
  const iu = new URL(inner, url); if (/\.(mp4|webm|mov|mp3|wav|glb)$/i.test(iu.pathname)) return null; // a video's poster we don't have: the app shows its own fallback
  return findMedia(s, iu, depth + 1);
}
async function media(req, url) {
  if (url.pathname.startsWith('/files/tryup')) { const hit = await (await caches.open('try-uploads')).match(url.pathname); return hit ?? new Response('', { status: 404 }); }
  const s = await snap(); const f = findMedia(s, url);
  if (!f) return new Response('', { status: 404, headers: { 'x-sample-mode': '1' } });
  return ranged(req, f.startsWith('/') ? f : DATA + 'm/' + f);
}

// ---- byte ranges: Safari plays a video or a song only when the server answers "Range: bytes=a-b" with 206 Partial Content. A static
//      host may send the whole file instead (wrangler dev does), so a range the host didn't honour is cut here from the whole file, kept
//      once in Cache Storage. A host that answers 206 itself is passed through as it is.
const RANGE_MEDIA = /\.(mp4|m4v|webm|mov|mp3|m4a|wav|ogg|oga|aac|flac)$/i;
async function ranged(req, path) {
  const range = req.headers.get('range'); if (!range) return fetch(path);
  const c = await caches.open('try-media'); let whole = await c.match(path);
  if (!whole) { const r = await fetch(path, { headers: { range } }); if (r.status !== 200) return r; // 206 from the host, or an error
    whole = r; try { await c.put(path, whole.clone()); } catch { /* storage full or blocked: still answer this one */ } }
  const buf = await whole.arrayBuffer(); const size = buf.byteLength; const type = whole.headers.get('content-type') || 'application/octet-stream';
  const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim()); let a, b;
  if (m && m[1] !== '') { a = Number(m[1]); b = m[2] !== '' ? Math.min(Number(m[2]), size - 1) : size - 1; }
  else if (m && m[2] !== '') { a = Math.max(0, size - Number(m[2])); b = size - 1; } // bytes=-N: the last N bytes
  if (a == null || a > b || a >= size) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${size}`, 'accept-ranges': 'bytes' } });
  return new Response(buf.slice(a, b + 1), { status: 206, headers: { 'content-type': type, 'content-range': `bytes ${a}-${b}/${size}`, 'content-length': String(b - a + 1), 'accept-ranges': 'bytes', 'x-sample-mode': '1' } });
}

// ---- uploads: kept in this browser only (Cache Storage), listed under Uploads, never sent anywhere ----
async function upload(req) {
  let fd; try { fd = await req.formData(); } catch { return json({ error: 'Upload failed', code: 'bad_upload' }, 400); }
  await load(); const c = await caches.open('try-uploads'); const items = []; const projectId = fd.get('projectId');
  for (const [, v] of fd) { if (typeof v === 'string') continue;
    const id = 'tryup' + Math.random().toString(36).slice(2, 10); const ext = (String(v.name).match(/\.[a-z0-9]{2,5}$/i)?.[0] ?? '').toLowerCase(); const url = `/files/${id}${ext}`;
    await c.put(url, new Response(v, { headers: { 'content-type': v.type || 'application/octet-stream' } }));
    const type = /^video\//.test(v.type) ? 'video' : /^audio\//.test(v.type) ? 'audio' : 'image';
    items.push({ id, tab: 'uploads', type, url, thumbUrl: url, name: v.name, createdAt: Date.now(), projectIds: projectId ? [String(projectId)] : [], warnings: [], sample: true }); }
  uploads.unshift(...items); await save();
  return json({ items, sample: true });
}
/** GET /api/media: the visitor's uploads on top of the recorded page (Uploads and All tabs, same kind). */
async function withUploads(s, r, url) {
  await load(); const q = url.searchParams; const tab = q.get('tab') ?? q.get('source'); const type = q.get('type') || q.get('kind');
  const extra = (!tab || tab === 'uploads') && !q.get('page') ? uploads.filter(u => !type || u.type === type) : [];
  if (!extra.length) return r ? answer(r) : json({ items: [], total: 0, hasMore: false });
  let b = {}; try { b = r ? JSON.parse(r.b) : {}; } catch { /* not json */ }
  return json({ ...b, items: [...extra, ...(b.items ?? [])], total: (b.total ?? 0) + extra.length, counts: { ...(b.counts ?? {}), uploads: (b.counts?.uploads ?? 0) + extra.length } });
}

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url); if (url.origin !== self.location.origin) return;
  if (!APP_PATHS.test(url.pathname)) {
    // a reload or deep link inside the app (/video, /workflows/x): the app's page; files (the built app, web/public) as they are
    if (e.request.mode === 'navigate' && !/\.[a-z0-9]+$/i.test(url.pathname)) e.respondWith(fetch('/'));
    else if (e.request.method === 'GET' && e.request.headers.has('range') && RANGE_MEDIA.test(url.pathname)) e.respondWith(ranged(e.request, url.pathname));
    return;
  }
  const m = e.request.method; const p = url.pathname;
  if (m === 'POST' && p === '/api/media') { e.respondWith(upload(e.request)); return; }
  e.respondWith(snap().then(s => {
    if (m === 'GET' && p === '/api/media') return withUploads(s, lookup(s, 'GET', url), url);
    return p.startsWith('/api/') && !s.media[p + url.search] && !s.media[alias(p)] && !p.startsWith('/api/media/') ? api(e.request, url) : media(e.request, url); })
    .catch(() => json({ error: NOT_HERE, code: 'sample_mode' }, 500)));
});
