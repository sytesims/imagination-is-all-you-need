/** Prompt grammar coverage guard (2026-10-26): every request body (and ComfyUI graph) built from a user prompt goes through the shared reference
 *  rewrite (shared/promptRefs.ts via routing/jobRefs.ts). Fails when a new tool, model, provider, route or local graph sends a prompt without it.
 *
 *  1. Behavioural: for every tool × offered model × place (Comfy Router, official lab API, fal, Replicate, local graph, Comfy Cloud / deployment),
 *     the tool's own parseInput reads a prompt with "@image1" and one reference attached (the files a submit carries, as the prompt peek does), then
 *     the body is built by the entry point the runner calls: routing/routeRequest.ts (hosted), comfy/plans.ts buildPlan (local),
 *     comfy/cloudWorkflows.ts buildCloudPlan (Comfy Cloud / deployment). When the user's words reach the body, no raw "@image1" may be left and
 *     the model's own form of the mention (applyRefGrammar: its token, "Image 1", or plain words for a model that can't name inputs) must be there.
 *  2. Static: every module that sends a request or builds a graph either calls the shared rewrite or is on ALLOW with a reason.
 *  Places a mention can't reach are sorted, each by its own reason: prompt-only ("@image1" refused at submit, the body still checked for a grammar
 *  entry), unreachable (the route refuses every job of that tool), no prompt in the body (upscalers), not wired (sample output only).
 *  Run: npx tsx test/prompt-refs-coverage.test.ts (temp data dir, mock backend, no keys, network blocked; ~5 s). COVERAGE_VERBOSE=1 lists every bucket. */
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'promptcov-'));
Object.assign(process.env, { OPENHIGGSFIELD_DATA_DIR: D, OPENHIGGSFIELD_ENV_FILE: path.join(D, 'x.env'), OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_FILMING_FILE: path.join(D, 'nofilm.json'), OPENHIGGSFIELD_SEED_COMMUNITY: '0' });
globalThis.fetch = (async (u: unknown) => { throw new Error(`network blocked in this test: ${String(u).slice(0, 80)}`); }) as typeof fetch;
const { listTools } = await import('../src/tools/registry.js');
const { toolModels, modelRoutes, routeModelKey } = await import('../src/routing/modelRegistry.js');
const { placeOfKind } = await import('../src/routing/jobRefs.js');
const { routeRequest } = await import('../src/routing/routeRequest.js');
const { buildPlan, hasPlan } = await import('../src/comfy/plans.js');
const { buildCloudPlan, CLOUD_WORKFLOWS } = await import('../src/comfy/cloudWorkflows.js');
const { applyRefGrammar, refCountsOf, promptLimitIssue } = await import('../src/shared/promptRefs.js');
const { promptGrammarOf } = await import('../src/shared/promptGrammar.js');
const { greyPng, silentWav } = await import('../src/routesPromptPeek.js');
const { SAMPLES_DIR } = await import('../src/config.js');
const { CLOUD_RUNNER_ROUTES } = await import('../src/routing/runnable.js');
const { ROUTER_RUNNER_ROUTES } = await import('../src/routing/routerModels.js');

// Router clip uploads (Kling / Seedance edit swaps) go to Comfy storage with the Comfy key: a fake key and a fake storage answer here, never the network
const ST = await import('../src/comfy/storage.js');
ST.setStorageFetch((async (u: any, init: any = {}) => { const url = String(u); const j = (o: unknown) => new Response(JSON.stringify(o), { status: 200, headers: { 'content-type': 'application/json' } });
  if (url.endsWith('/customers/storage') && init.method === 'POST') { const b = JSON.parse(init.body); return j({ upload_url: `https://storage.test/put/${b.file_name}`, download_url: `https://storage.test/get/${b.file_name}` }); }
  if (url.startsWith('https://storage.test/put/')) return new Response('', { status: 200 });
  if (url.endsWith('/proxy/seedance/virtual-library/assets')) return j({ asset_id: 'asset-1' });
  if (/\/proxy\/seedance\/assets\/asset-1$/.test(url)) return j({ id: 'asset-1', asset_type: 'Video', group_id: 'virtual-library', status: 'Active' });
  return new Response('nope', { status: 404 }); }) as typeof fetch, async () => {});
const withComfyKey = async <T>(f: () => Promise<T>): Promise<T> => { process.env.COMFY_API_KEY = 'test-not-a-real-key'; try { return await f(); } finally { delete process.env.COMFY_API_KEY; } };

const MARK = 'zebracorn'; const PROMPT = `@image1 ${MARK} waves at the camera`;
// stand-in files under DATA_DIR (relative names, as a submit hands them to parseInput)
const put = (name: string, data: Buffer) => { fs.writeFileSync(path.join(D, name), data); return name; };
const PNG = put('ref.png', greyPng(1024, 576)); const PNG2 = put('ref2.png', greyPng(1024, 576)); /* video start frames need ≥ 409,600 px, swap characters ≥ 300 px a side, ×2 upscales ≤ 2048 px */ const WAV = put('voice.wav', (() => { const w = silentWav(3); for (let k = 44; k + 1 < w.length; k += 2) w.writeInt16LE(Math.round(8000 * Math.sin(((k - 44) / 2) * 2 * Math.PI * 220 / 16000)), k); return w; })()); // a 220 Hz tone: talking photo refuses silence
const CLIP = (() => { fs.copyFileSync(path.join(SAMPLES_DIR, 'sample-take.mp4'), path.join(D, 'clip.mp4')); return 'clip.mp4'; })();
const fileFor = (name: string, accept = '') => (/video/.test(accept) || /^(video|clip)$/.test(name) ? CLIP : /audio/.test(accept) || /audio|speech|voice/i.test(name) ? WAV : name === 'image' ? PNG : PNG2);

const MODE_ORDER = ['edit', 'r2v', 'i2v', 'image-to-3d'];
/** Field / file sets to try, best first: a mode that takes references, with the image (ref 1) attached; then the tool's other modes; then prompt only. */
function attempts(t: any, engine: string, prompt: string): { fields: Record<string, string>; files: Record<string, string[]> }[] {
  const ins: any[] = t.inputs ?? []; const types = ins.find((x) => x.name === 'types'); const opts: string[] = types?.options ?? [];
  // modes to try: reference modes first, then a few of the rest plus the first of each preset family (Camera Moves: ltx-…, h3-…) and each mode a route of this engine asks for
  const fam = new Map<string, string>(); for (const o of opts) { const f = o.split('-')[0]; if (o.includes('-') && opts.filter((x) => x.startsWith(f + '-')).length >= 3 && !fam.has(f)) fam.set(f, o); }
  const routeModes = toolModels(t).flatMap((m: any) => modelRoutes(t, m)).filter((x: any) => x.engine === engine).flatMap((x: any) => x.route.modes ?? []).filter((m: string) => opts.includes(m));
  const modes = [...new Set([...MODE_ORDER.filter((m) => opts.includes(m)), ...opts.slice(0, opts.length <= 8 ? 8 : 3), ...fam.values(), ...routeModes])];
  const reqFiles = ins.filter((x) => (x.kind === 'file' || x.kind === 'files') && x.required);
  const textReq = ins.filter((x) => x.kind === 'text' && x.required && x.name !== 'prompt'); const selReq = ins.filter((x) => x.kind === 'select' && x.required);
  const base = (withImage: boolean) => { const files: Record<string, string[]> = {};
    for (const x of reqFiles) files[x.name] = [fileFor(x.name, x.accept)];
    if (withImage) { if (ins.some((x) => x.name === 'image')) files.image ??= [PNG]; else if (ins.some((x) => x.name === 'refs')) files.refs ??= [PNG]; }
    const fields: Record<string, string> = { prompt, provider: engine }; for (const x of textReq) fields[x.name] = prompt; for (const x of selReq) fields[x.name] = x.options?.[0] ?? t.presets?.[0]?.id ?? ''; /* Restyle: preset = the first look */ if (ins.some((x) => x.name === 'lyrics')) fields.lyrics = 'la la la'; // YuE2 sings lyrics only
    return { fields, files }; };
  const out: { fields: Record<string, string>; files: Record<string, string[]> }[] = [];
  const all = () => { const b = base(true); for (const x of ins) if ((x.kind === 'file' || x.kind === 'files') && !/lastFrame|endImage/.test(x.name)) b.files[x.name] ??= [fileFor(x.name, x.accept)]; return b; }; // optional clip / voice / mask too (Voice Studio over a video, Inpaint)
  for (const mk of [() => base(true), all, () => base(false)]) { if (!modes.length) out.push(mk()); for (const m of modes) { const b = mk(); b.fields.types = JSON.stringify([m]); out.push(b); } }
  for (const x of EXTRA[t.id] ?? EXTRA[t.app?.gallery?.base] ?? []) { const b = base(false); b.files = Object.fromEntries(x.files.map((n) => [n, Array(x.count ?? 1).fill(fileFor(n))])); if (x.types) b.fields.types = JSON.stringify([x.types]); Object.assign(b.fields, x.fields ?? {}); out.push(b); }
  return out;
}
/** Field sets a tool needs beyond the generic ones (a mode's own files and fields). */
const EXTRA: Record<string, { types?: string; files: string[]; count?: number; fields?: Record<string, string> }[]> = {
  voice: [{ types: 'voiceover', files: ['video'] }, { types: 'lipsync', files: ['image', 'speech'] }, { types: 'change-voice', files: ['video', 'voiceAudio'] }, { types: 'translate', files: ['video'], fields: { language: 'es' } }],
  'h3-video': ['r2v', 'i2v', 't2v'].map((m) => ({ types: m, files: m === 't2v' ? [] : ['image'], fields: { duration: '5', aspect: 'auto' } })), // the fal H3 routes start at 5 s
  reshoot: [{ files: ['video'], fields: { yaw: '30', tilt: '10' } }], // H3 CrossView: the take alone and a camera position
  'photos-reel': [{ files: ['photos'], count: 8, fields: { title: 'Sea view flat' } }], // Photos → Reel: 8–15 photos and a title (the app's gallery base points here)
  soundtrack: [{ types: 'music', files: ['video'], fields: { lyrics: 'la la la' } }], audio: [{ types: 'music', files: [], fields: { lyrics: 'la la la' } }], // YuE2 sings lyrics only
};
// Parsing is lazy and memoised per tool × engine × prompt × field set: most places build from the first field set, so the guard stays fast.
const attemptsMemo = new Map<string, ReturnType<typeof attempts>>(); const parseMemo = new Map<string, Promise<{ input: any } | { error: string }>>(); const T0 = Date.now(); 
const attemptsOf = (t: any, engine: string, prompt: string) => { const k = `${t.id}|${engine}|${prompt}`; if (!attemptsMemo.has(k)) { const seen = new Set<string>(); attemptsMemo.set(k, attempts(t, engine, prompt).filter((a) => { const j = JSON.stringify(a); return !seen.has(j) && !!seen.add(j); })); } return attemptsMemo.get(k)!; };
function parseAt(t: any, engine: string, prompt: string, n: number): Promise<{ input: any } | { error: string }> {
  const k = `${t.id}|${engine}|${prompt}|${n}`; if (parseMemo.has(k)) return parseMemo.get(k)!;
  const a = attemptsOf(t, engine, prompt)[n];
  const res = (async () => { try { const r: any = await t.parseInput({ ...a.fields }, a.files); return r && typeof r.error !== 'string' ? { input: r } : { error: String(r?.error ?? 'no input') }; } catch (e) { return { error: String((e as Error).message) }; } })();
  parseMemo.set(k, res); return res;
}
/** Parses are mostly waiting on ffprobe: start the likely ones (each engine’s first field sets) 16 at a time before the sequential checks. */
async function prefetch() {
  const jobs: (() => Promise<unknown>)[] = [];
  for (const t of listTools()) for (const engine of new Set(toolModels(t).flatMap((m: any) => m.parts.map((p: any) => p.engine)))) { const n = Math.min(3, attemptsOf(t, engine, PROMPT).length); for (let k = 0; k < n; k++) jobs.push(() => parseAt(t, engine, PROMPT, k)); }
  let next = 0; await Promise.all(Array.from({ length: 16 }, async () => { while (next < jobs.length) await jobs[next++](); }));
}
/** Whether the quote offers this place for the job (routing/select.ts option(): the route's modes, its own refusal, the model's prompt cap). */
const offered = (r: any, i: any, t: any) => { const mode = String((Array.isArray(i.types) ? i.types[0] : null) ?? i.mode ?? ''); if (r.modes && mode && !r.modes.includes(mode)) return false;
  const text = [i.finalPrompt, i.hostedPrompt, i.prompt, i.text].find((x) => typeof x === 'string' && x); if (text && promptLimitIssue(routeModelKey(t.id, r.modelId, r.routeId, i), text, r.routeId)) return false;
  try { return !r.unavailableFor?.(i); } catch { return false; } };

/** Mirrors routing/run.ts execute(): the places where a runner sends a real request (else the route renders a sample only). */
const sendsBody = (r: any) => r.kind === 'local' || !!r.direct || !!r.request || r.kind === 'fal' || r.kind === 'replicate' || !!r.cloudRun || CLOUD_RUNNER_ROUTES.has(r.routeId) || ROUTER_RUNNER_ROUTES.has(r.routeId);
/** Places with no body builder of their own, each with its reason (no blanket skips: by route id). */
const NO_BODY: Record<string, string> = {
  'comfy-cloud:cloud-tripo-31': 'Tripo 3.1 image-to-3D on a Comfy partner-node graph (tools/threeD.ts runTripoCloud): photo only, the graph has no prompt input',
  'comfy-cloud:cloud-topaz-starlight-fast': 'Topaz video upscale on a Comfy partner-node graph (tools/videoUpscaleModels.ts): video + size only, the graph has no prompt input',
  'comfy-cloud:cloud-topaz-precise': 'Topaz video upscale on a Comfy partner-node graph: video + size only, no prompt input',
  'comfy-cloud:cloud-topaz-astra2': 'Topaz video upscale on a Comfy partner-node graph: video + size only, no prompt input',
  'comfy-cloud:cloud-topaz-creative': 'Topaz video upscale on a Comfy partner-node graph: video + size only, no prompt input',
};
/** Model keys whose grammar entry is missing on purpose: none today. A new model must get an entry in shared/promptGrammar.ts. */
const NO_GRAMMAR: Record<string, string> = {};
/** tool|model the test can't make an input for (by model key, with the reason). */
const NO_TEST_INPUT: Record<string, string> = {
  'make-it-real|comfy-ltx25-layout': 'renders a stored Direct a Shot plan job (planJob id + its mockup video); its Router renders build through routeRequest like every other Router body',
  'make-it-real|kling-v3-omni-edit': 'renders a stored Direct a Shot plan job (planJob id + its mockup video)', 'make-it-real|luma-ray-3.2-edit': 'renders a stored Direct a Shot plan job',
  'make-it-real|runway-aleph-2': 'renders a stored Direct a Shot plan job', 'make-it-real|seedance-2.5-edit': 'renders a stored Direct a Shot plan job',
  'plan-a-shot|local-previz': 'Direct a Shot: drawn in the browser from scene streams, our own renderer; no model prompt',
};

const stats = { combos: 0, checked: 0, tagged: 0, promptOnly: 0, noPrompt: 0, notWired: 0, noBody: 0, unreachable: 0 };
const fails: string[] = []; const log: Record<string, string[]> = { promptOnly: [], noPrompt: [], unreachable: [], noBody: [] }; const seen = new Set<string>();
/** The body this place sends, built by the runner's own entry point. */
async function bodyFor(t: any, engine: string, r: any, input: any): Promise<string | null> {
  const job: any = { id: 'cov', toolId: t.id, provider: engine, status: 'queued', input, route: r.routeId };
  let body: unknown;
  if (r.kind === 'local') { if (!hasPlan(job)) return null; body = buildPlan(job).passes.map((p: any) => p.graph); } // null: an engine outside ComfyUI (ffmpeg, Whisper…)
  else if (r.kind === 'comfy-cloud' || r.routeId.startsWith('comfy-deploy:')) { const wf = CLOUD_WORKFLOWS[r.routeId]; if (wf && 'prepare' in wf && wf.prepare) await wf.prepare(job); /* the runner's free local prep first (H3 Extend: the context clip), as routing/cloudRun.ts */ body = buildCloudPlan(wf ? { ...job, provider: wf.provider } : job).passes.map((p: any) => p.graph); }
  else { const ex = t.routedExtras ? await t.routedExtras(job) : {}; body = (await (r.kind === 'comfy-router' ? withComfyKey(() => routeRequest(job, r, 0, ex)) : routeRequest(job, r, 0, ex))).body; }
  return JSON.stringify(body, (_k, v) => (v instanceof FormData ? Object.fromEntries([...v.entries()].filter(([, x]) => typeof x === 'string')) : v)); // multipart bodies (OpenAI image edits): their text fields
}
/** Field sets in order: the first input the quote offers on this place whose body builds (a mode its graph can't take throws: the next is tried). */
async function firstBody(t: any, engine: string, r: any, prompt: string) {
  const out = { parsed: 0, offered: 0, errors: [] as string[], body: null as null | { text: string | null; input: any }, firstParsed: null as any };
  for (let n = 0; n < attemptsOf(t, engine, prompt).length; n++) {
    const p = await parseAt(t, engine, prompt, n); if ('error' in p) { out.errors.push(p.error); continue; }
    out.parsed++; out.firstParsed ??= p.input; if (!offered(r, p.input, t)) continue; out.offered++;
    try { out.body = { text: await bodyFor(t, engine, r, p.input), input: p.input }; return out; } catch (e) { out.errors.push(String((e as Error).message).slice(0, 160)); }
  }
  return out;
}
const PLAIN = `${MARK} waves at the camera`;
await prefetch();
for (const t of listTools()) for (const m of toolModels(t)) for (const { engine, route: r } of modelRoutes(t, m)) {
  stats.combos++; const id = `${t.id} × ${m.key} × ${r.routeId}`; seen.add(id);
  if (r.comingSoon || r.routerOff || !sendsBody(r)) { stats.notWired++; continue; } // listed, but no runner sends a request there yet (sample output only)
  if (r.cloudRun) { assert.ok(NO_BODY[r.routeId], `${id}: a cloudRun route needs a body check or a NO_BODY reason`); stats.noBody++; log.noBody.push(`${id}: ${NO_BODY[r.routeId]}`); continue; }
  let res = await firstBody(t, engine, r, PROMPT); let promptOnly = false;
  if (!res.body) { // no job with "@image1" builds here: it must be a prompt-only place (the mention is refused at submit) or one this tool never sends jobs to
    const refused = res.errors.find((e) => /@image1/.test(e)); const tried = res; res = await firstBody(t, engine, r, PLAIN);
    if (!res.parsed) { if (!NO_TEST_INPUT[`${t.id}|${m.key}`]) fails.push(`${id}: the test can't make an input for this tool (add a field set to attempts(), or NO_TEST_INPUT with a reason): ${[...new Set(res.errors)].join(' / ').slice(0, 400)}`); continue; }
    if (!res.offered) { stats.unreachable++; const p = res.firstParsed; log.unreachable.push(`${id}: ${(() => { try { return r.unavailableFor?.(p) ?? promptLimitIssue(routeModelKey(t.id, r.modelId, r.routeId, p), p.finalPrompt ?? p.prompt ?? '', r.routeId) ?? `takes modes ${r.modes}`; } catch (e) { return String(e); } })()}`); continue; } // the route refuses every job this tool makes (its own reason)
    if (!res.body) { fails.push(`${id}: body not built (${res.errors.at(-1)})`); continue; }
    if (!refused) { fails.push(`${id}: a prompt with "@image1" ${tried.offered ? `is taken but its body fails (${tried.errors.at(-1)})` : 'neither reaches this place nor is refused at submit'}`); continue; }
    promptOnly = true; if (tried.offered) log.promptOnly.push(`${id}: its @image1 jobs have no graph (${tried.errors.at(-1)})`);
  }
  const b = res.body!;
  if (b.text == null) { stats.noBody++; log.noBody.push(`${id}: no local graph`); continue; }
  const { input } = b; const text = b.text!;
  if (!text.includes(MARK)) { stats.noPrompt++; log.noPrompt.push(id); continue; } // the user's words never reach this body (upscale, background removal…)
  const gKey = routeModelKey(t.id, engine, r.routeId, input); const place = placeOfKind(r.kind);
  if (!promptGrammarOf(gKey) && !NO_GRAMMAR[gKey]) { fails.push(`${id}: model ${gKey} has no prompt grammar entry (shared/promptGrammar.ts)`); continue; }
  if (promptOnly) { stats.promptOnly++; log.promptOnly.push(id); continue; } // its grammar is known; "@image1" can't reach it
  stats.checked++;
  if (/@image1(?!\d)/.test(text)) { fails.push(`${id}: raw "@image1" in the body`); continue; }
  const want = applyRefGrammar('@image1', gKey, refCountsOf(input), place);
  if (want !== '@image1' && !text.includes(JSON.stringify(want).slice(1, -1))) fails.push(`${id}: expected "${want}" (${gKey} @ ${place}) in the body`);
  else stats.tagged++;
}
console.log(JSON.stringify(stats));
if (process.env.COVERAGE_VERBOSE) { for (const [k, v] of Object.entries(log)) console.log(`${k}:\n  ${v.join('\n  ')}`); console.log(`${parseMemo.size} parses, ${Date.now() - T0} ms`); }
assert.deepEqual(fails, [], `\n${fails.join('\n')}`);
// Local voice models must stay in the sweep (2026-10-27, Qwen3 TTS 1.7B replaced the direct Alibaba entry): the script reaches the local graph, the grammar entry exists
for (const id of ['audio × qwen3-tts × local:comfy-qwen3tts', 'audio × chatterbox × local:comfy-chatterbox', 'audio × fish-audio-drama-3 × local:comfy-drama3']) {
  assert.ok(seen.has(id), `${id} is no longer swept`); assert.ok(log.promptOnly.includes(id), `${id}: expected its script in the local graph, prompt-only`); }
assert.ok(![...seen].some((id) => id.includes('direct-qwen3-tts')), 'the retired direct Qwen3 TTS entry must not come back');
console.log(`ok behavioural: ${stats.checked} of ${stats.combos} tool × model × place combos send the user's prompt; all in the model's own reference form`);

// ---- 2. static: who sends requests or builds graphs, and where bodies are built ----
const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src');
const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : /\.ts$/.test(e.name) ? [path.join(d, e.name)] : []));
const files = walk(SRC).map((f) => ({ rel: path.relative(SRC, f).split(path.sep).join('/'), text: fs.readFileSync(f, 'utf8') }));
const code = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1'); // comments out (a mention in a comment is not a call)
/** A module that sends a request or runs a graph: a POST, a provider / ComfyUI / Router call or a runner. */
const SENDS = /method: ?['"]POST['"]|\bclient\.submit\(|\b(falRun|replicateRun|runDirect|runNative|runNativeSafe|runQueued|runCloudWorkflow|runRouter)\(|new (ComfyCloudV2|ComfyRouter)\(/;
/** Every such module, and why its prompts are rewritten (or why it has none). A new one fails until it is listed here. */
const SENDERS: Record<string, { calls?: RegExp; why: string }> = {
  'routing/run.ts': { calls: /routeRequest\(/, why: 'hosted runner: every lab / fal / Replicate body comes from routeRequest' },
  'routing/routerRun.ts': { calls: /routeRequest\(/, why: 'Comfy Router runner: bodies from routeRequest' },
  'routing/cloudRun.ts': { calls: /buildCloudPlan\(/, why: 'Comfy Cloud / deployment runner: graphs from buildCloudPlan' },
  'comfy/runNative.ts': { calls: /= buildPlan\b/, why: 'local ComfyUI runner: graphs from buildPlan (or the builder its caller passes)' },
  'providers.ts': { calls: /runNativeSafe\(/, why: 'local runs go through comfy/runNative.ts' }, 'pipeline.ts': { calls: /runNativeSafe\(/, why: 'local runs go through comfy/runNative.ts' },
  'comfyClient.ts': { why: 'legacy Comfy SDK swap path (remote ComfyUI without the native API): sends our own swap wording built from the target, never the prompt' },
  'routesComfyDeploy.ts': { why: 'deployment smoke test: inverts a sample image, no prompt' },
  'routing/orphans.ts': { why: 'cancels orphaned remote jobs; sends no body' },
  'tools/threeD.ts': { why: 'Tripo 3.1 image-to-3D: the job prompt is always empty' },
  'tools/videoUpscaleModels.ts': { why: 'Topaz video upscale on Comfy Cloud partner-node graphs: video + size only, no prompt input' },
  'tools/soul/cloud.ts': { why: 'ESRGAN upscale of a finished result: no prompt' },
  'comfyRouter.ts': { why: 'Comfy Router transport: sends the body it is given' }, 'comfy/cloudV2.ts': { why: 'Comfy Cloud transport: sends the graph it is given' },
  'comfy/native.ts': { why: 'local ComfyUI transport: sends the graph it is given' }, 'comfy/storage.ts': { why: 'uploads media to Comfy storage; no prompt' },
  'mediaHandoff.ts': { why: 'the shared media hand-off: uploads files to fal / Replicate storage; no prompt' },
  'providers/fal.ts': { why: 'fal transport (falImageInput is called only from routeRequest)' }, 'providers/replicate.ts': { why: 'Replicate transport (replicateImageInput only from routeRequest)' },
  'providers/byteplus.ts': { why: 'BytePlus lab body builders (route.direct.build), called only from routeRequest' }, 'providers/gemini.ts': { why: 'Gemini lab body builders, called only from routeRequest' },
  'providers/openai.ts': { why: 'OpenAI lab body builders, called only from routeRequest' }, 'hostedRequests.ts': { why: 'lab body builders (route.direct.build / route.request), called only from routeRequest' },
  'cinema/enhance.ts': { why: 'prompt enhancer (a local LLM you run): rewrites the words before the job; the job then goes through the rewrite like any other' },
  'translate.ts': { why: 'Voice Studio translate: the transcript, not a prompt' },
  'cinema/story.ts': { why: 'submits each shot as a normal job (app.inject), which takes the usual path' }, 'routesEdit.ts': { why: 'submits a normal job (app.inject)' },
  'filmProjects.ts': { why: 'submits each shot as a normal job and the stitch to /api/compose (app.inject)' }, 'canvasAgent.ts': { why: 'stitches finished clips through /api/compose (app.inject); no prompt' },
  'photosToReel.ts': { why: 'Photos → Reel: submits each photo as a normal Camera Moves job, the stitch to /api/compose and the music bed as a normal job (app.inject)' },
  'routesGaps.ts': { why: 'job webhooks: posts the finished job, not a model request' },
  'openapi.ts': { why: 'API description text' }, 'routesDiscover.ts': { why: 'API description text' }, 'routesSpecs.ts': { why: 'API description text' },
};
const sfails: string[] = [];
for (const f of files) {
  if (!SENDS.test(f.text)) continue; const e = SENDERS[f.rel];
  if (!e) { sfails.push(`${f.rel} sends a request or runs a graph: build its body with routing/routeRequest.ts (hosted) or comfy/plans.ts buildPlan (graphs), then list it in SENDERS with why`); continue; }
  if (e.calls && !e.calls.test(code(f.text))) sfails.push(`${f.rel} no longer calls ${e.calls}: ${e.why}`);
}
for (const k of Object.keys(SENDERS)) if (!files.some((f) => f.rel === k)) sfails.push(`SENDERS lists ${k}, which is gone`);
/** Body builders are invoked in one place (routeRequest); the prompt peek also calls a Router body, on input it rewrote itself (withRefGrammar). */
const BUILD_CALL = /\bspec\.body\(|\.direct\.build\(|\br\.request!?\(|(?<!function )\b(falImageInput|replicateImageInput)\(|DIRECT_CLIENTS\[/;
const BUILD_AT: Record<string, RegExp> = { 'routing/routeRequest.ts': /refInputFor\(job, r\)/, 'routesPromptPeek.ts': /withRefGrammar\(/ };
for (const f of files) { const c = code(f.text); if (!BUILD_CALL.test(c)) continue; const need = BUILD_AT[f.rel];
  if (!need) sfails.push(`${f.rel} builds a request body itself (${c.match(BUILD_CALL)![0]}): use routing/routeRequest.ts so the prompt rewrite applies`);
  else if (!need.test(c)) sfails.push(`${f.rel} builds bodies without ${need}`); }
// media hand-off (src/mediaHandoff.ts): every body hands its files over in one place, so no module encodes a file inline itself
for (const f of files) if (f.rel !== 'mediaHandoff.ts' && /\.toString\(\s*['"]base64['"]\s*\)|;base64,\$\{/.test(code(f.text))) sfails.push(`${f.rel} encodes a file inline itself: send media with handOff() from src/mediaHandoff.ts`);
// the graph builders apply the rewrite on entry
const src = (rel: string) => code(files.find((f) => f.rel === rel)!.text);
assert.match(src('comfy/plans.ts'), /export function buildPlan\([^)]*\)[^{]*\{\s*const j = \{ \.\.\.j0, input: withRefGrammar\(/, 'buildPlan rewrites the input first');
assert.match(src('comfy/cloudWorkflows.ts'), /isStandalone\(w\)\) \{ const plan = w\.plan\(\{ \.\.\.j, input: withRefGrammar\(/, 'standalone cloud plans (H3 CrossView) rewrite the input first');
assert.match(src('routing/jobRefs.ts'), /setPlanModelKey\(/, 'local graphs use the runners\' model key'); assert.match(src('index.ts'), /import '\.\/routing\/jobRefs\.js'/, 'the server loads it at start');
assert.match(src('routing/routeRequest.ts'), /export async function routeRequest\([^\n]*\n\s*const gi = refInputFor\(job, r\);/, 'routeRequest rewrites the input first');
// web: removing a photo that counts as @imageN renumbers the prompt's mentions (shared/mentions.ts), the start photo included
const appTool = fs.readFileSync(path.join(SRC, '../../web/src/tools/app/AppTool.tsx'), 'utf8');
for (const h of appTool.match(/clearImage=\{[^}]*\}/g) ?? []) if (!/dropMention|removeImageMention|renumberMentions/.test(h)) sfails.push(`web AppTool: ${h.slice(0, 60)}… removes a photo without renumbering the @image mentions`);
assert.deepEqual(sfails, [], `\n${sfails.join('\n')}`);
console.log(`ok static: ${files.filter((f) => SENDS.test(f.text)).length} sending modules listed with a reason; body builders called only from routeRequest (and the peek, on rewritten input)`);
process.exit(0);
