// Video model health check, backend half (own mock server, no keys, no network, nothing spent). For every video tool × model × route × mode the bar offers:
//  1 schema: the job the server stored → the request body our runner would send (the app's own builder) → validated against the provider's published
//    request schema (saved OpenAPI documents; see test/_model-health.ts), local / Comfy Cloud graphs against ComfyUI /object_info;
//  2 limits: each option the bar offers (min / max length, every resolution, every aspect, sound on / off, frames, references at the maximum) is accepted by the
//    backend (length rule, the route's own block with a key set) and the body runs exactly what was picked (no silent length / size / shape change);
//  3 price: the quote (GET /api/tools/:id/price, route pinned) has a price for every offered combination; local = 0;
//  4 submit: the job is created on that route and the mock result lands.
// Writes $MODEL_HEALTH_DIR/backend.json (default <tmp>/model-health) for scripts/model-health-report.mjs. Fails on a finding not listed in KNOWN.
// Live ComfyUI /object_info (GET only): MODEL_HEALTH_COMFY=http://127.0.0.1:8188. Run: npx tsx test/model-health.e2e.ts
import { testPort } from './_ports.js'; import { spawn, execFileSync } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import Database from 'better-sqlite3';
import { FILE_INPUT, VIDEO_TOOLS, CAPS_TOOLS, validatorFor, schemaErrors, schemaFor, graphIssues, faithIssues, schemaChoices, resHeight, knownFor, KNOWN, type Row } from './_model-health.js';
const ROOT = path.resolve(import.meta.dirname, '..'); const D = fs.mkdtempSync(path.join(os.tmpdir(), 'mhealth-')); const SDATA = path.join(D, 'server'); const LDATA = path.join(D, 'local');
fs.mkdirSync(SDATA); fs.mkdirSync(LDATA); const OUT = process.env.MODEL_HEALTH_DIR ?? path.join(os.tmpdir(), 'model-health'); fs.mkdirSync(OUT, { recursive: true });
const PORT = Number(process.env.MODEL_HEALTH_API_PORT) || testPort(8812); const B = `http://127.0.0.1:${PORT}`; const t0 = Date.now();
const FAKE = 'test-not-a-real-key';
const NOKEYS = { OPENHIGGSFIELD_BFL_API_KEY: '', OPENHIGGSFIELD_FAL_KEY: '', FAL_KEY: '', OPENHIGGSFIELD_REPLICATE_API_TOKEN: '', REPLICATE_API_TOKEN: '', COMFY_API_KEY: '', OPENHIGGSFIELD_MOCK_KEYS: '', OPENHIGGSFIELD_USE_LOCAL: '',
  OPENHIGGSFIELD_MINIMAX_API_KEY: '', OPENHIGGSFIELD_LTX_API_KEY: '', OPENHIGGSFIELD_ARK_API_KEY: '', OPENHIGGSFIELD_DASHSCOPE_API_KEY: '', OPENHIGGSFIELD_LUMA_API_KEY: '' };
// in-process builders: own data dir, mock backend, a public base for reference links (Seedance / Replicate take reference videos by URL)
Object.assign(process.env, NOKEYS, { OPENHIGGSFIELD_DATA_DIR: LDATA, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'local.env'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_PUBLIC_BASE_URL: 'https://me.example.test/',
  OPENHIGGSFIELD_COMFY_ROUTER_URL: 'http://127.0.0.1:9', COMFY_BASE_URL: 'http://127.0.0.1:9' });
const srv = spawn('npx', ['tsx', 'src/index.ts'], { cwd: ROOT, detached: true, stdio: ['ignore', 'ignore', 'inherit'], env: { ...process.env, ...NOKEYS, PORT: String(PORT), HOST: '127.0.0.1', OPENHIGGSFIELD_DATA_DIR: SDATA,
  OPENHIGGSFIELD_ENV_FILE: path.join(D, 'server.env'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_MOCK_DELAY_MS: '50', OPENHIGGSFIELD_MAX_QUEUED: '5000', OPENHIGGSFIELD_MOCK_RENDER: 'copy',
  OPENHIGGSFIELD_FILMING_FILE: path.join(D, 'nofilm.json'), OPENHIGGSFIELD_SEED_COMMUNITY: '0', OPENHIGGSFIELD_PUBLIC_BASE_URL: 'https://me.example.test' /* Replicate builds reference links from it; nothing is fetched in mock */ } });
const S = '../src/';
const { getTool } = await import(S + 'tools/registry.ts') as any; const { routesFor } = await import(S + 'routing/routes.ts') as any;
const { routeRunnable } = await import(S + 'routing/runnable.ts') as any; const { routerModelOfRoute } = await import(S + 'routing/routerModels.ts') as any;
const { VIDEO_LIMITS, resolveDuration, durationsFor } = await import(S + 'tools/h3/videoCaps.ts') as any;
const { buildPlan, hasPlan } = await import(S + 'comfy/plans.ts') as any; const { buildCloudPlan } = await import(S + 'comfy/cloudWorkflows.ts') as any;
const { CLOUD_RUNNER_ROUTES } = await import(S + 'routing/runnable.ts') as any;
// Comfy storage (comfy/storage.ts): URL-only Router fields (Seedance reference / edit video, Kling Omni Edit…) upload first. A FAKE in-process storage answers,
// so those bodies are still built and checked against the schema with no network (the Router base above is unreachable on purpose).
{ const ST = await import(S + 'comfy/storage.ts') as any; let n = 0; const js = (o: unknown) => new Response(JSON.stringify(o), { status: 200, headers: { 'content-type': 'application/json' } });
  ST.setStorageFetch((async (u: any, init: any = {}) => { const url = String(u);
    if (url.endsWith('/customers/storage') && init.method === 'POST') { const f = JSON.parse(init.body).file_name; return js({ upload_url: `https://storage.test/put/${f}?sig=x`, download_url: `https://storage.test/get/${f}?sig=y` }); }
    if (url.startsWith('https://storage.test/put/') && init.method === 'PUT') return new Response('', { status: 200 });
    if (url.endsWith('/proxy/seedance/virtual-library/assets')) return js({ asset_id: `asset-${++n}` });
    const a = url.match(/\/proxy\/seedance\/assets\/(asset-\d+)$/); if (a) return js({ id: a[1], status: 'Active' });
    return new Response('not faked', { status: 404 }); }) as typeof fetch, async () => {}); }

// ---- object_info: saved fixtures, or the live ComfyUI (GET only) when asked
const OI: Record<string, any> = {}; let oiSource = 'saved fixtures';
for (const f of fs.readdirSync(path.join(import.meta.dirname, 'fixtures')).filter((x) => /^object-info-.*\.json$/.test(x))) Object.assign(OI, JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'fixtures', f), 'utf8')));
if (process.env.MODEL_HEALTH_COMFY) { try { const r = await fetch(`${process.env.MODEL_HEALTH_COMFY.replace(/\/$/, '')}/object_info`, { signal: AbortSignal.timeout(8000) }); if (r.ok) { Object.assign(OI, await r.json()); oiSource = `live ${process.env.MODEL_HEALTH_COMFY}`; } } catch { /* stays on fixtures */ } }
const usedClasses = new Set<string>();

// ---- tiny inputs
const ff = (...a: string[]) => execFileSync('ffmpeg', ['-y', '-v', 'error', ...a]);
const PNG = path.join(D, 'a.png'); ff('-f', 'lavfi', '-i', 'testsrc2=size=1280x720', '-frames:v', '1', PNG);
const PNG2 = path.join(D, 'b.png'); ff('-f', 'lavfi', '-i', 'color=c=orange:s=1280x720', '-frames:v', '1', PNG2);
const MP4 = path.join(D, 'v.mp4'); ff('-f', 'lavfi', '-i', 'testsrc2=size=854x480:rate=24', '-f', 'lavfi', '-i', 'sine=d=5', '-t', '5', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-c:a', 'aac', '-shortest', MP4);
const MP3 = path.join(D, 'a.mp3'); ff('-f', 'lavfi', '-i', 'sine=frequency=440:duration=3', MP3);
const TYPE: Record<string, string> = { '.png': 'image/png', '.mp4': 'video/mp4', '.mp3': 'audio/mpeg' };

const j = async (u: string, init?: RequestInit) => { const r = await fetch(`${B}${u}`, init); let b: any = null; try { b = await r.json(); } catch { /* */ } return { status: r.status, b }; };
async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>) { let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) await fn(items[i++]); })); }
let db: any = null; const rawInput = async (id: string) => { for (let k = 0; k < 40; k++) { try { db ??= new Database(path.join(SDATA, 'openhiggsfield.db'), { readonly: true, fileMustExist: true });
  const r = db.prepare('SELECT data FROM jobs WHERE id = ?').get(id); if (r) return JSON.parse(r.data).input; } catch { /* not written yet */ } await new Promise((ok) => setTimeout(ok, 150)); } return null; };
const absPaths = (i: any) => { const o: any = { ...i }; for (const [k, v] of Object.entries(i)) { if (/Path$/.test(k) && typeof v === 'string' && v && !path.isAbsolute(v)) o[k] = path.join(SDATA, v);
  if (/Paths$/.test(k) && Array.isArray(v)) o[k] = v.map((x: any) => (typeof x === 'string' && x && !path.isAbsolute(x) ? path.join(SDATA, x) : x)); } return o; };

type Case = { tool: any; p: any; route: any; mode: string; fields: Record<string, string>; files: [string, string][]; asked: Record<string, any>; tag: string };
const options = new Map<string, { ok: number; refused: string[]; case: Case }>(); // per offered option: did any place of the model take it?
const rows = new Map<string, Row>(); const fresh: string[] = []; const stillKnown = new Set<string>();
const rowOf = (c: Case): Row => { const k = `${c.tool.id}|${c.p.id}|${c.route.routeId}|${c.mode}`; let r = rows.get(k);
  if (!r) { r = { tool: c.tool.id, model: c.p.modelKey ?? c.p.id, modelName: c.p.name, engine: c.p.id, routeId: c.route.routeId, routeKind: c.route.kind, wired: routeRunnable(c.route), mode: c.mode, cases: 0,
    schema: 'n/a', limits: 'pass', price: 'pass', submit: 'pass', verified: VIDEO_LIMITS[c.p.id]?.verified ?? null, failures: [], notes: [], minQuote: null }; rows.set(k, r); } return r; };
const fail = (c: Case, check: 'schema' | 'limits' | 'price' | 'submit', msg: string) => { const r = rowOf(c); (r as any)[check] = 'fail'; const line = `${check}: ${msg} [${c.tag}]`; if (!r.failures.includes(line)) r.failures.push(line);
  const key = `${check}|${c.tool.id}|${c.route.routeId}|${c.mode}`; if (knownFor(key)) stillKnown.add(knownFor(key)!); else fresh.push(`${key}: ${msg} [${c.tag}]`); };
const note = (c: Case, msg: string) => { const r = rowOf(c); if (!r.notes.includes(msg)) r.notes.push(msg); };

// ---- cases: what the bar offers, option by option
/** Apps on Generate Video lock their mode (Transitions = start + end frame) or switch it by the files added (UGC Ad: a photo = references). */
function appModes(tool: any): { mode: string; file?: string }[] | null {
  const g = tool.app?.gallery; if (!g) return null; const tj = (x: any) => { try { return JSON.parse(x)[0]; } catch { return null; } };
  const out: { mode: string; file?: string }[] = []; const lm = tj(g.locked?.types); if (lm) out.push({ mode: lm });
  for (const [file, t] of Object.entries<any>(g.modeWhenFile ?? {})) { const m = tj(t); if (m && !out.some((x) => x.mode === m)) out.push({ mode: m, file }); }
  return out.length ? out : null;
}
function casesFor(tool: any): Case[] {
  const tdef = getTool(tool.id); const app = tool.app ?? {}; const names = new Set((tool.inputs ?? []).map((i: any) => i.name)); const out: Case[] = []; const am = appModes(tool);
  const inp = (n: string) => (tool.inputs ?? []).find((i: any) => i.name === n);
  for (const p of tool.providers) {
    const apiRoutes = new Set((p.routes ?? []).map((r: any) => r.routeId ?? r.id ?? r)); const routes = routesFor(p.id, tdef).filter((r: any) => !apiRoutes.size || apiRoutes.has(r.routeId));
    const L = app.videoLimits?.[p.id] ?? null; const caps = CAPS_TOOLS.has(tool.id) && !!L; const pm: string[] | undefined = app.providerModes?.[p.id];
    const modes: { mode: string; file?: string }[] = am ? am.filter((x) => !pm || pm.includes(x.mode)) : CAPS_TOOLS.has(tool.id) ? (pm ?? (tool.presets ?? []).map((x: any) => x.id)).map((mode: string) => ({ mode })) : [{ mode: tool.presets?.[0]?.id ?? '' }];
    const durs: number[] = (app.durationsByProvider?.[p.id] ?? p.durations ?? L?.duration?.values ?? L?.durations ?? []).filter((n: number) => Number.isInteger(n));
    for (const route of routes) for (const { mode, file: modeFile } of modes) {
      if (route.modes?.length && mode && CAPS_TOOLS.has(tool.id) && !route.modes.includes(mode)) continue; // fal text-to-video route etc.: another route of the model serves that mode
      const rc = caps && route.caps?.aspects ? route.caps : null; // a route that narrows the model (H3: local 16:9 / 9:16 / 1:1, fal references Auto only, Replicate 768p)
      const resOpts: string[] = rc?.resolutions ?? L?.resolutions ?? app.resolutionsByProvider?.[p.id] ?? inp('resolution')?.byProvider?.[p.id] ?? inp('resolution')?.options?.map((o: any) => o.value ?? o) ?? [];
      const aspOpts: string[] = rc?.aspects ?? L?.aspects ?? inp('aspect')?.options?.map((o: any) => o.value ?? o) ?? [];
      const base: Record<string, any> = {};
      const dField = names.has('duration') ? 'duration' : names.has('seconds') && tool.id !== 'reshoot' ? 'seconds' : names.has('extendSeconds') ? 'extendSeconds' : null;
      const dDef = app.defaultDurationByProvider?.[p.id] ?? Number(inp(dField ?? '')?.default); if (dField && durs.length) base.duration = durs.includes(dDef) ? dDef : durs.includes(5) ? 5 : durs[0];
      if (names.has('resolution') && resOpts.length) { const d = app.defaultResolutionByProvider?.[p.id] ?? inp('resolution')?.default; base.resolution = resOpts.includes(d) ? d : resOpts[0]; }
      if (names.has('aspect') && aspOpts.length) { const d = inp('aspect')?.default; base.aspect = caps ? 'auto' : aspOpts.includes(d) ? d : aspOpts[0]; }
      if (caps && names.has('audio') && L.audio?.supported) base.audio = L.audio.default !== false;
      const byRes = (r: string | undefined, d: number) => { const l = r ? (L ?? VIDEO_LIMITS[p.id])?.durationsByResolution?.[r] : null; return l && !l.includes(d) ? l[0] : d; };
      if (base.duration != null) base.duration = byRes(base.resolution, base.duration);
      const vs: Record<string, any>[] = [base];
      if (base.duration != null) { vs.push({ ...base, duration: byRes(base.resolution, Math.min(...durs)) }, { ...base, duration: byRes(base.resolution, Math.max(...durs)) }); }
      for (const r of resOpts) if (base.resolution != null && r !== base.resolution) vs.push({ ...base, resolution: r, ...(base.duration != null ? { duration: byRes(r, base.duration) } : {}) });
      if (caps && names.has('aspect') && (mode === 't2v' || mode === 'r2v')) for (const a of aspOpts) if (a !== 'auto') vs.push({ ...base, aspect: a });
      if (caps && base.audio != null && L.audio?.toggle) vs.push({ ...base, audio: !base.audio });
      const refMax = rc?.refMax ?? L?.refMax ?? {}; const rk: string[] = rc?.refKinds ?? L?.refKinds ?? [];
      if (caps && mode === 'r2v' && !am) { if ((refMax.image ?? 1) > 1) vs.push({ ...base, _refs: (refMax.image ?? 1) - 1 }); if (rk.includes('video') && refMax.video) vs.push({ ...base, _rv: 1 }); if (rk.includes('audio') && refMax.audio) vs.push({ ...base, _ra: 1 }); }
      const seen = new Set<string>();
      for (const v of vs) { const key = JSON.stringify(v); if (seen.has(key)) continue; seen.add(key);
        const fields: Record<string, string> = { rights: '1', prompt: 'A lighthouse on a calm sea at dusk, slow wide shot', provider: p.id, route: route.routeId, seed: '7' };
        if (mode && tool.presets?.length && tool.id !== 'camera' && !am) fields.types = JSON.stringify([mode]);
        if (v.duration != null && dField) fields[dField] = String(v.duration); if (v.resolution) fields.resolution = v.resolution; if (v.aspect) fields.aspect = v.aspect; if (v.audio != null) fields.audio = v.audio ? '1' : '0';
        if (tool.id === 'cinema') fields.mode = 'generate';
        if (tool.id === 'reshoot') Object.assign(fields, { yaw: '30', tilt: '0' }); // one new angle (H3 CrossView needs azimuth + elevation)
        if (names.has('preset') && mode && !fields.preset) fields.preset = mode; // Restyle / swaps: the preset select carries the look
        const files: [string, string][] = [];
        for (const i of tool.inputs ?? []) if (i.kind === 'file' && i.required && !(CAPS_TOOLS.has(tool.id) && !am && (i.name === 'image' || i.name === 'lastFrame'))) files.push([i.name, /video/.test(i.accept ?? '') || i.name === 'video' ? MP4 : /audio/.test(i.accept ?? '') ? MP3 : i.name === 'lastFrame' ? PNG2 : PNG]);
        if (modeFile && !files.some(([n]) => n === modeFile)) files.push([modeFile, PNG]);
        const needImg = CAPS_TOOLS.has(tool.id) ? !am && ['i2v', 'flf', 'r2v'].includes(mode) : ['camera', 'photo-fx', 'app-orbit-shot'].includes(tool.id);
        if (needImg && names.has('image') && !files.some(([n]) => n === 'image')) files.push(['image', PNG]);
        if (mode === 'flf' && !am && names.has('lastFrame')) files.push(['lastFrame', PNG2]);
        if (/swap|motion|restyle/.test(tool.id) && names.has('refs')) files.push(['refs', PNG2]);
        for (let k = 0; k < (v._refs ?? 0); k++) files.push(['refs', PNG2]); if (v._rv) files.push(['refVideos', MP4]); if (v._ra) files.push(['refAudios', MP3]);
        const asked = { duration: v.duration, resolution: v.resolution, aspect: v.aspect, audio: v.audio, audioOff: L?.audio?.off, mode };
        const tag = Object.entries({ d: v.duration, res: v.resolution, ar: v.aspect, snd: v.audio == null ? undefined : v.audio ? 'on' : 'off', refs: v._refs ? v._refs + 1 : undefined, rv: v._rv, ra: v._ra }).filter(([, x]) => x != null).map(([k, x]) => `${k}=${x}`).join(' ');
        out.push({ tool, p, route, mode, fields, files, asked, tag: tag || 'default' });
      }
    }
  }
  return out;
}

async function bodyFor(c: Case, job: any): Promise<{ kind: 'json'; body: any; file?: string; strip?: string[]; note?: string; soft?: boolean } | { kind: 'graphs'; graphs: Record<string, any>[] } | { kind: 'none'; why: string }> {
  const r = c.route;
  if (r.kind === 'comfy-router') { if (r.routerOff || !routeRunnable(r)) return { kind: 'none', why: `Comfy Router body not wired for ${c.tool.id} (route runs samples only)` };
    const spec = routerModelOfRoute(r.routeId); if (!spec) return { kind: 'none', why: 'no Router body builder' }; const sc = schemaFor(r, c.p.id, spec.id);
    return { kind: 'json', body: await spec.body(job.input, 0), file: sc?.file }; }
  if (r.kind === 'local') { if (!hasPlan(job)) return { kind: 'none', why: 'no native ComfyUI plan for this job (legacy runner)' }; return { kind: 'graphs', graphs: buildPlan(job).passes.map((x: any) => x.graph) }; }
  if (r.kind === 'comfy-cloud') { if (!CLOUD_RUNNER_ROUTES.has(r.routeId)) return { kind: 'none', why: 'no Comfy Cloud runner for this route (samples only)' }; return { kind: 'graphs', graphs: buildCloudPlan(job).passes.map((x: any) => x.graph) }; }
  if (r.direct) { const req = await r.direct.build(job); const sc = schemaFor(r, c.p.id); return { kind: 'json', body: req.body, file: sc?.file, strip: sc?.strip, note: sc?.note, soft: sc?.soft }; }
  if (typeof r.request === 'function') { const sc = schemaFor(r, c.p.id); return { kind: 'json', body: await r.request(job), file: sc?.file }; }
  return { kind: 'none', why: 'no live runner for this route' };
}

async function runCase(c: Case) {
  const row = rowOf(c); row.cases++;
  if (c.tool.id === 'make-it-real') { note(c, 'needs a Direct a Shot preview job first (planJob): covered by the UI click-through and test/make-it-real.test.ts'); row.submit = 'pass'; return; }
  // 3 price
  const qs = new URLSearchParams(Object.entries(c.fields).filter(([k]) => k !== 'rights')); for (const [n] of c.files) qs.set(n, '1');
  if (c.files.some(([n]) => n === 'refs')) qs.set('refs', String(c.files.filter(([n]) => n === 'refs' || n === 'image').length));
  const q = await j(`/api/tools/${c.tool.id}/price?${qs}`);
  if (q.status >= 400) { fail(c, q.b?.code === 'invalid_duration' ? 'limits' : 'price', `quote ${q.status} ${q.b?.code ?? ''} ${String(q.b?.error ?? '').slice(0, 140)}`); return; }
  const local = c.route.kind === 'local'; const okey = `${c.tool.id}|${c.p.id}|${c.mode}|${c.tag}`; const opt = options.get(okey) ?? { ok: 0, refused: [] as string[], case: c }; options.set(okey, opt);
  if (local && q.b?.runnable === false) { opt.ok++; note(c, `not runnable on this computer: ${String(q.b?.reason ?? q.b?.blockedReason ?? q.b?.reasonCode ?? '').slice(0, 120)}`); return; } // hardware fit: this machine, not the wiring
  const credits = q.b?.listCredits ?? q.b?.credits;
  if (q.b?.routeId !== c.route.routeId) note(c, `quote ran on ${q.b?.routeId} (asked ${c.route.routeId})`);
  if (local ? q.b?.credits !== 0 : !(typeof credits === 'number' && credits > 0 && q.b?.priceAvailable !== false)) fail(c, 'price', `no price (credits ${q.b?.credits}, list ${q.b?.listCredits}, priceAvailable ${q.b?.priceAvailable}${q.b?.unpricedReason ? `, ${q.b.unpricedReason}` : ''})`);
  else if (!local) { const usd = typeof q.b?.exactUsd === 'number' ? q.b.exactUsd : null; if (!row.minQuote || credits < row.minQuote.credits) row.minQuote = { credits, usd, seconds: c.asked.duration, resolution: c.asked.resolution, aspect: c.asked.aspect, audio: c.asked.audio, source: q.b?.hosted?.sourceUrl }; }
  // 2a length rule (quote = submit)
  if (c.asked.duration != null) { const d = resolveDuration(c.tool.id, c.p.id, c.asked.duration, c.asked.resolution); if (d && 'error' in d) fail(c, 'limits', `backend refuses an offered length: ${d.error}`); }
  // 4 submit
  const fd = new FormData(); for (const [k, v] of Object.entries({ ...c.fields, ...(typeof q.b?.credits === 'number' ? { quotedRouteId: q.b.routeId, quotedCredits: String(q.b.credits) } : {}) })) fd.append(k, v);
  for (const [n, f] of c.files) fd.append(n, new Blob([fs.readFileSync(f)], { type: TYPE[path.extname(f)] }), path.basename(f));
  const s = await j(`/api/tools/${c.tool.id}/jobs`, { method: 'POST', body: fd });
  if (s.status === 409 && s.b?.code === 'route_not_runnable') { const why = String(s.b?.error ?? s.b?.message ?? ''); // this place of the model doesn't take the option; another may
    if (local && /run on a Mac|too heavy|graphics memory|not reachable/i.test(why)) { opt.ok++; note(c, `not runnable on this computer: ${why.slice(0, 120)}`); return; }
    opt.refused.push(`${c.route.routeId}: ${why.replace(/^.*can't run this job\.\s*/, '').replace(/\s*Pick another place.*$/, '')}`); note(c, `refuses ${c.tag}: ${why.replace(/^.*can't run this job\.\s*/, '').replace(/\s*Pick another place.*$/, '').slice(0, 120)}`); return; }
  if (s.status !== 200 || !s.b?.id) { fail(c, 'submit', `submit ${s.status} ${s.b?.code ?? ''} ${String(s.b?.error ?? s.b?.message ?? '').slice(0, 160)}`); return; }
  opt.ok++; if (s.b.route && s.b.route !== c.route.routeId) note(c, `job ran on ${s.b.route} (asked ${c.route.routeId})`);
  // the mock result: waited for on the first case of each row (the rest only need the job created; mock renders still encode with ffmpeg)
  let job: any = null; if (!row.resultChecked) { row.resultChecked = true; for (let k = 0; k < 200; k++) { job = (await j(`/api/jobs/${s.b.id}`)).b; if (['done', 'failed', 'blocked', 'canceled', 'needs_decision'].includes(job?.status)) break; await new Promise((ok) => setTimeout(ok, 150)); }
  if (job?.status !== 'done' || !(job.outputs?.length || job.resultUrl)) fail(c, 'submit', `job ${job?.status ?? 'missing'}${job?.error ? `: ${String(job.error).slice(0, 140)}` : ''}`); }
  // 1 + 2b: the body this job would send
  const input0 = await rawInput(s.b.id); if (!input0) { fail(c, 'schema', 'job input not found in the database'); return; }
  if (/-still\.mp4$/.test(String(input0.videoPath ?? ''))) { delete input0.videoPath; delete input0.videoUrl; } // the mock run's BEFORE clip (apps.ts run), never on a live job
  const input = absPaths(input0); const jj = { id: `mh${s.b.id}`, toolId: c.tool.id, provider: c.route.twinProvider ?? c.p.id, input, routing: {} };
  const keyed = c.route.envKey; if (keyed) process.env[keyed] = FAKE; // the route's own block applies only with a key set: check it as a keyed server would
  let refusedWithKey = false;
  try { const why = c.route.unavailableFor?.(input); if (why) { refusedWithKey = true; opt.ok--; opt.refused.push(`${c.route.routeId} (with a key): ${why}`); note(c, `with a key set, refuses ${c.tag}: ${String(why).slice(0, 120)}`); } } catch (e: any) { fail(c, 'limits', `block threw: ${e.message}`); }
  if (refusedWithKey) { if (keyed) process.env[keyed] = ''; return; } // a keyed server refuses this job before it runs, so no body is ever built (the option check below still needs another place to take it)
  let b: Awaited<ReturnType<typeof bodyFor>>; try { b = await bodyFor(c, jj); } catch (e: any) { if (keyed) process.env[keyed] = ''; fail(c, 'schema', `body builder threw: ${String(e.message).slice(0, 160)}`); return; }
  if (keyed) process.env[keyed] = '';
  if (b.kind === 'none') { note(c, b.why); return; }
  if (b.kind === 'graphs') { for (const g of b.graphs) { for (const n of Object.values<any>(g)) usedClasses.add(n.class_type);
      const { errors, notes } = graphIssues(g, OI); const missing = errors.filter((e) => /is not in \/object_info/.test(e));
      const real = oiSource.startsWith('live') ? errors : errors.filter((e) => !missing.includes(e)); if (missing.length && !oiSource.startsWith('live')) note(c, `not in saved object_info: ${missing.map((m) => m.split(' ')[3]).join(', ')}`);
      if (real.length && c.route.kind === 'comfy-cloud') note(c, `graph differs from this ComfyUI (Comfy Cloud runs its own version): ${real.slice(0, 2).join('; ')}`);
      else if (real.length) fail(c, 'schema', `graph: ${real.slice(0, 3).join('; ')}`); else if (row.schema !== 'fail') { row.schema = 'pass'; row.schemaNote = `ComfyUI /object_info (${oiSource})`; } for (const n of notes) note(c, n); }
    return; }
  if (!b.file) { note(c, 'no published request schema saved for this route'); }
  else { const v = validatorFor(b.file); if (!v) note(c, `schema ${b.file} not found locally`); else {
    const body = { ...b.body }; for (const k of b.strip ?? []) delete body[k]; const err = schemaErrors(v, body);
    if (err && b.soft) note(c, `${b.file} (another place's form of this API, not binding here) says: ${err}`); else if (err) fail(c, 'schema', `${b.file}: ${err}`); else if (row.schema !== 'fail') { row.schema = 'pass'; row.schemaNote = b.file + (b.note ? ` (${b.note})` : ''); }
    const ch = schemaChoices(v); const offeredRes = (c.tool.app?.videoLimits?.[c.p.id]?.resolutions ?? []).map(resHeight);
    if (ch.res && offeredRes.length) { const hid = ch.res.filter((h) => !offeredRes.includes(h) && !(h === 768 && offeredRes.includes(720))); if (hid.length) note(c, `provider also takes ${hid.map((h) => `${h}p`).join(', ')} (not offered)`); }
    const offD: number[] = c.p.durations ?? []; if (ch.durations && offD.length && ch.durations.length < 40) { const hid = ch.durations.filter((d) => d > 0 && !offD.includes(d)); if (hid.length) note(c, `provider also takes ${hid.join(', ')} s (not offered)`); }
    const offA: string[] = (c.tool.app?.videoLimits?.[c.p.id]?.aspects ?? []); if (ch.ratios && offA.length) { const hid = ch.ratios.filter((a) => a !== 'adaptive' && !offA.includes(a)); if (hid.length) note(c, `provider also takes ${hid.join(', ')} (not offered)`); } } }
  for (const m of faithIssues({ ...c.asked, mode: (input.imagePath || (!CAPS_TOOLS.has(c.tool.id) && c.files.some(([n]) => n === 'image' || n === 'refs'))) && !['t2v', 'r2v'].includes(input.mode) ? 'i2v' /* a first frame sets the shape */ : input.mode ?? c.asked.mode, audioOff: input.audioOff ?? c.asked.audioOff }, b.body)) fail(c, 'limits', m);
}

let failed = 0;
try {
  for (let i = 0; i < 160; i++) { try { if ((await fetch(`${B}/api/health`)).ok) break; } catch { /* */ } await new Promise((r) => setTimeout(r, 500)); }
  const health = (await j('/api/health')).b; if (health?.backend !== 'mock') throw new Error(`server is not on the mock backend (${health?.backend})`);
  const tools: any[] = (await j('/api/tools')).b; const cases: Case[] = [];
  for (const id of VIDEO_TOOLS) { const t = tools.find((x) => x.id === id); if (!t) { console.log(`skip ${id}: not on this server`); continue; } cases.push(...casesFor(t)); }
  // per model: the lengths the bar lists = the lengths the backend accepts
  for (const c of cases) { const ui: number[] | null = c.p.durations ?? null; const be = durationsFor(c.tool.id, c.p.id); if (ui && be && JSON.stringify(ui) !== JSON.stringify(be)) fail(c, 'limits', `bar lengths ${ui.join(',')} ≠ backend ${be.join(',')}`); }
  console.log(`${cases.length} cases over ${new Set(cases.map((c) => `${c.tool.id}|${c.p.id}|${c.route.routeId}|${c.mode}`)).size} tool × model × route × mode rows (object_info: ${oiSource})`);
  let done = 0; await pool(cases, Number(process.env.MODEL_HEALTH_POOL) || 4, async (c) => { try { await runCase(c); } catch (e: any) { fail(c, 'submit', `case threw: ${String(e?.message ?? e).slice(0, 160)}`); } if (++done % 100 === 0) console.log(`  ${done}/${cases.length}`); });
  for (const [, o] of options) if (o.ok <= 0 && o.refused.length) fail(o.case, 'limits', `the bar offers ${o.case.tag} (${o.case.mode || 'default'}) but no place of this model takes it: ${o.refused.slice(0, 2).join(' / ')}`);
  const list = [...rows.values()];
  fs.writeFileSync(path.join(OUT, 'backend.json'), JSON.stringify({ at: new Date().toISOString(), objectInfo: oiSource, rows: list }, null, 1));
  if (process.env.MODEL_HEALTH_FIXTURE && oiSource.startsWith('live')) { const strip = (spec: any) => { const c = JSON.parse(JSON.stringify(spec)); for (const g of ['required', 'optional']) for (const [k, v] of Object.entries<any>(c.input?.[g] ?? {})) if (FILE_INPUT.test(k) && Array.isArray(v?.[0])) v[0] = []; return { input: c.input, output: c.output, name: c.name }; }; // no local file lists in the fixture
    const keep = Object.fromEntries([...usedClasses].filter((k) => OI[k]).sort().map((k) => [k, strip(OI[k])])); fs.writeFileSync(process.env.MODEL_HEALTH_FIXTURE, JSON.stringify(keep)); console.log(`wrote ${Object.keys(keep).length} classes to ${process.env.MODEL_HEALTH_FIXTURE}`); }
  const count = (k: keyof Row, v: string) => list.filter((r) => r[k] === v).length;
  console.log(`rows ${list.length}: schema ${count('schema', 'pass')} pass / ${count('schema', 'fail')} fail / ${count('schema', 'n/a')} n/a · limits ${count('limits', 'pass')}/${count('limits', 'fail')} · price ${count('price', 'pass')}/${count('price', 'fail')} · submit ${count('submit', 'pass')}/${count('submit', 'fail')}`);
  const gone = Object.keys(KNOWN).filter((k) => !k.startsWith('ui|') && !stillKnown.has(k)); if (gone.length) console.log(`known findings no longer seen (remove from KNOWN): ${gone.join(', ')}`);
  if (fresh.length) { failed++; console.error(fresh.slice(0, 80).join('\n')); console.error(`${fresh.length} new findings (not in KNOWN)`); } else console.log('ok no new findings');
} catch (e) { failed++; console.error('FAIL', e); } finally { try { db?.close(); } catch { /* */ } try { process.kill(-srv.pid!); } catch { /* */ } fs.rmSync(D, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); }
console.log(`model-health: ${failed ? 'FAILED' : 'ALL OK'} in ${((Date.now() - t0) / 1000).toFixed(0)} s`); process.exit(failed ? 1 : 0);
