// Try it (sample mode): the app's server, played back inside the browser. This service worker answers every request the real
// web app makes to its own server: GET /api/* from snap.json (recorded from a MOCK server by scripts/try/record.mjs), media from
// m/ (copied by scripts/try/build.mjs), and the few writes a visitor makes with small fakes (a Generate becomes a sample job that
// goes queued -> running -> done with an example result). Nothing leaves the browser and nothing is generated.
// SPDX-License-Identifier: AGPL-3.0-or-later
const BASE = new URL('./', self.location).pathname; // '/try/'
const VOLATILE = new Set(['_', 't', 'ts', 'now', 'cb', 'v', 'since', 'after', 'nonce']); // same list as scripts/try/record.mjs
const APP_PATHS = /^\/(api|files|samples|s|examples|showcase|fonts|models|learn)\/|^\/(favicon|apple-touch|app-icon|manifest)/;
const SAMPLE_REASON = 'Sample mode: nothing was generated and nothing was paid. This is an example result. Install the app to make your own.';
const NOT_HERE = 'Sample mode: this part needs the app on your computer. Install it to use it for real.';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

let snapP = null;
/** snap.json once per worker: routes {key: {s, t, b}}, templates {toolId: job}, media {url: file}, plus indexes built here. */
function snap() {
  if (!snapP) snapP = fetch(BASE + 'snap.json').then(r => r.json()).then(s => {
    s.byPath = {}; for (const k of Object.keys(s.routes)) { const p = k.split('?')[0]; (s.byPath[p] ??= []).push(k); }
    s.jobs = {}; // every job seen in a recorded list, by id (for /api/jobs/:id and ?ids=)
    for (const k of s.byPath['GET /api/jobs'] ?? []) { try { const b = JSON.parse(s.routes[k].b); for (const j of (Array.isArray(b) ? b : b.items ?? [])) if (j?.id) s.jobs[j.id] ??= j; } catch { /* not a list */ } }
    return s;
  });
  return snapP;
}

// ---- the visitor's own sample runs: kept in memory and in Cache Storage, so a reload or a sleeping worker keeps them ----
const STATE = BASE + '__state.json'; let mine = null, routing = null, boards = null; // routing: the visitor's Run on choices ({tool: {model: {runOn, route}}}); boards: their Canvas boards
async function load() { if (mine) return; try { const r = await (await caches.open('try-state')).match(STATE); const st = r ? await r.json() : {}; mine = st.jobs ?? []; routing = st.routing ?? {}; boards = st.boards ?? []; } catch { mine = []; routing = {}; boards = []; } }
async function myJobs() { await load(); return mine; }
async function save() { try { await (await caches.open('try-state')).put(STATE, new Response(JSON.stringify({ jobs: mine, routing, boards }), { headers: { 'content-type': 'application/json' } })); } catch { /* private window */ } }
const QUEUED_MS = 1200, RUN_MS = 6000;
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

/** Each tool's kind of result (image, video, audio, 3d), from the recorded tool registry. */
function mediaOf(s) { if (s.mediaOf) return; s.mediaOf = {}; try { const t = JSON.parse(s.routes['GET /api/tools']?.b ?? '[]'); for (const x of (Array.isArray(t) ? t : t.tools ?? [])) s.mediaOf[x.id] = x.media; } catch { /* no registry */ } }

/** A Generate: a sample job built from a recorded finished job of the same tool (its example output), marked as a sample. */
async function createJob(s, toolId, req) {
  let fields = {}; try { const fd = await req.formData(); for (const [k, v] of fd) if (typeof v === 'string') fields[k] = v; } catch { /* no form */ }
  mediaOf(s);
  const same = (j) => j?.status === 'done' && j.outputs?.length; const kind = s.mediaOf[toolId];
  // this tool's own finished run, else a finished run of the same kind (video, image, audio, 3D), else any
  const tpl = s.templates[toolId] ?? Object.values(s.jobs).find(j => j.toolId === toolId && same(j))
    ?? Object.values(s.templates).find(j => kind && s.mediaOf[j.toolId] === kind) ?? Object.values(s.jobs).find(j => kind && s.mediaOf[j.toolId] === kind && same(j))
    ?? s.templates['create-image'] ?? Object.values(s.templates)[0];
  if (!tpl) return json({ error: NOT_HERE, code: 'sample_mode' }, 400);
  const id = 'try' + Math.random().toString(36).slice(2, 10); const now = Date.now();
  const job = { ...tpl, id, toolId, startedAt: now, createdAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString(), finishedAt: new Date(now + QUEUED_MS + RUN_MS).toISOString(),
    prompt: fields.prompt ?? tpl.prompt, params: { ...(tpl.params ?? {}), ...fields }, status: 'done', state: 'done', stage: 'done', progress: 100, percent: 100,
    isSample: true, sampleReason: SAMPLE_REASON, sampleLabel: 'Sample', demo: true, demoMessage: SAMPLE_REASON, featuredExample: false, cost: 0, actualCost: null, free: true, favourite: false, trashed: false, projectId: null };
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

/** Same rule as scripts/try/record.mjs withRoute: a price is looked up with the saved Run on route of its tool + model first. */
function withRoute(url) { const m = url.pathname.match(/^\/api\/tools\/([^/]+)\/price$/); const r = m && routing?.[decodeURIComponent(m[1])]?.[url.searchParams.get('model') ?? '']?.route;
  if (!r) return null; const u = new URL(url); u.searchParams.set('__route', r); return u; }

async function api(req, url) {
  const s = await snap(); await load(); const m = req.method; const p = url.pathname;
  let mm;
  if (p === '/api/me/routing' && (m === 'PUT' || m === 'GET')) {
    if (m === 'PUT') { try { const b = await req.json(); for (const [t, ms] of Object.entries(b.perTool ?? {})) routing[t] = { ...(routing[t] ?? {}), ...ms }; await save(); } catch { /* not json */ } }
    let base = {}; try { base = JSON.parse(s.routes['GET /api/me/routing']?.b ?? '{}'); } catch { /* none */ }
    return json({ ...base, perTool: { ...(base.perTool ?? {}), ...routing } }); }
  if (p.startsWith('/api/canvas/boards')) { const r = await canvas(s, req, url); if (r) return r; }
  if (m === 'POST' && /^\/api\/(models\/quotes|tools\/[^/]+\/price-variants)$/.test(p)) { let tool = ''; try { tool = (await req.clone().json()).toolId ?? ''; } catch { /* not json */ }
    const r = lookup(s, 'POST', new URL(`${p}?toolId=${encodeURIComponent(tool || p.split('/')[3])}`, url)); if (r) return answer(r); }
  if (m === 'POST' && (mm = p.match(/^\/api\/tools\/([^/]+)\/jobs$/))) return createJob(s, decodeURIComponent(mm[1]), req);
  if ((mm = p.match(/^\/api\/jobs\/([^/]+)$/)) && m === 'GET') { const j = (await myJobs()).find(x => x.id === mm[1]); if (j) return json(live(j)); if (s.jobs[mm[1]]) return json(s.jobs[mm[1]]); }
  if (p === '/api/jobs' && m === 'GET' && url.searchParams.has('ids')) { const ids = url.searchParams.get('ids').split(','); const my = await myJobs();
    return json(ids.map(id => { const j = my.find(x => x.id === id); return j ? live(j) : s.jobs[id]; }).filter(Boolean)); }
  if ((mm = p.match(/^\/api\/jobs\/([^/]+)\/(cancel|favourite|project|restore|visibility)$/)) && m !== 'GET') { const my = await myJobs(); const j = my.find(x => x.id === mm[1]);
    if (j && mm[2] === 'cancel') { j.status = j.state = 'canceled'; await save(); } if (j && mm[2] === 'favourite') { j.favourite = !j.favourite; await save(); }
    return json({ ok: true, sample: true, ...(j ? live(j) : {}) }); }
  if ((mm = p.match(/^\/api\/jobs\/([^/]+)$/)) && m === 'DELETE') { mine = (await myJobs()).filter(x => x.id !== mm[1]); await save(); return json({ ok: true, sample: true }); }
  if (m === 'GET') {
    const ru = withRoute(url); const r = (ru && s.routes[keyOf('GET', ru)]) || lookup(s, 'GET', url);
    if (r) return (p === '/api/jobs' || p === '/api/assets') ? withMine(s, r, url) : answer(r);
    if (/\/(stream|events)$/.test(p)) return new Response(': sample mode, no live updates\n\n', { headers: { 'content-type': 'text/event-stream' } });
    return json({ error: NOT_HERE, errorType: 'not_found', code: 'sample_mode', sample: true }, 404);
  }
  // writes: a recorded answer for the same route (prices for every model, a new board), else a friendly "needs the app"
  if (/\/price(-variants)?$|\/quote$|\/precheck$|\/validate$|\/resolve$/.test(p)) { const r = lookup(s, m, url) ?? lookup(s, m, new URL(p, url)); if (r) return answer(r); }
  const r = s.routes[`${m} ${p}`]; if (r) return answer(r);
  if (m === 'PUT' || m === 'PATCH') return json({ ok: true, sample: true }); // settings and preferences: accepted for this visit only
  return json({ error: NOT_HERE, code: 'sample_mode', errorType: 'sample_mode', sample: true }, 400);
}

/** Media the pages load (web/public, the mock's /files and /samples, posters): the copy in m/, by full URL, then by path. */
/** A thumbnail or poster we never recorded at this size: the same picture at another size, else the picture it was made from. */
function findMedia(s, url, depth = 0) {
  const f = s.media[url.pathname + url.search] ?? (url.search ? null : s.media[url.pathname]); if (f) return f;
  if (!/^\/api\/media\/(thumb|poster)$/.test(url.pathname) || depth > 3) return s.media[url.pathname] ?? null;
  const inner = url.searchParams.get('url'); if (!inner) return null;
  const same = Object.keys(s.media).find(k => k.startsWith(url.pathname + '?') && new URL(k, url).searchParams.get('url') === inner); if (same) return s.media[same];
  const iu = new URL(inner, url); if (/\.(mp4|webm|mov|mp3|wav|glb)$/i.test(iu.pathname)) return null; // a video's poster we don't have: the app shows its own fallback
  return findMedia(s, iu, depth + 1);
}
async function media(req, url) {
  const s = await snap(); const f = findMedia(s, url);
  if (!f) return new Response('', { status: 404, headers: { 'x-sample-mode': '1' } });
  const h = new Headers(); const range = req.headers.get('range'); if (range) h.set('range', range);
  return fetch(BASE + 'm/' + f, { headers: h });
}

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url); if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith(BASE)) {
    // a reload or deep link inside the app (/try/video): the app's page, whatever the path
    if (e.request.mode === 'navigate' && !/\.[a-z0-9]+$/i.test(url.pathname)) e.respondWith(fetch(BASE + 'index.html'));
    return;
  }
  if (!APP_PATHS.test(url.pathname) || e.request.mode === 'navigate') return;
  e.respondWith(snap().then(s => url.pathname.startsWith('/api/') && !s.media[url.pathname + url.search] && !s.media[url.pathname] && !url.pathname.startsWith('/api/media/') ? api(e.request, url) : media(e.request, url))
    .catch(() => json({ error: NOT_HERE, code: 'sample_mode' }, 500)));
});
