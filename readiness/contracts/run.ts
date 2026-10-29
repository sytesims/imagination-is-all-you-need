/**
 * Hosted contract tests (npm run contracts:test). No network: builds every hosted provider's request through
 * server/src/hostedRequests.ts + comfyRouter.ts and checks it against
 *  - partner nodes: ComfyUI object_info input schema (validator install, = docs.comfy.org/built-in-nodes)
 *  - Comfy Router: readiness/contracts/spec/router-openapi.yaml (public spec copy)
 *  - direct APIs: schemas/*.json (hand-transcribed from vendor docs)
 * and parses fixtures/*.json (HAND-WRITTEN from docs, not recorded live). Writes results.json.
 */
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { listTools } from '../../server/src/tools/registry.js';
import { getProvider, providerWorkflows, type ProviderDef } from '../../server/src/providers.js';
import * as H from '../../server/src/hostedRequests.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const J = (p: string) => JSON.parse(fs.readFileSync(path.join(HERE, p), 'utf8'));
// OBJECT_INFO = a ComfyUI /object_info dump (e.g. curl http://127.0.0.1:8190/object_info > object_info.json); default: <repo>/.cache/object_info.json
const OI_PATH = process.env.OBJECT_INFO ?? path.join(HERE, '../../.cache/object_info.json');
if (!fs.existsSync(OI_PATH)) { console.error(`contracts: no object_info at ${OI_PATH}; set OBJECT_INFO to a ComfyUI /object_info dump`); process.exit(2); }
const OI = JSON.parse(fs.readFileSync(OI_PATH, 'utf8'));
const SPEC = fs.readFileSync(path.join(HERE, 'spec/router-openapi.yaml'), 'utf8');
// INTEGRATION_CARDS = optional local folder of provider integration notes; without it the card cross-check is skipped.
const CARDS_DIR = process.env.INTEGRATION_CARDS; const HAS_CARDS = !!CARDS_DIR && fs.existsSync(CARDS_DIR);
const CARDS = HAS_CARDS ? fs.readdirSync(CARDS_DIR!).map((f) => fs.readFileSync(path.join(CARDS_DIR!, f), 'utf8')).join('\n') : '';

type Row = { id: string; name: string; kind: string; target: string; status: 'green' | 'amber' | 'red'; checks: number; errors: string[]; notes: string[] };
const PRIM: Record<string, (v: any) => boolean> = { STRING: (v) => typeof v === 'string', INT: Number.isInteger, FLOAT: (v) => typeof v === 'number', BOOLEAN: (v) => typeof v === 'boolean' };

/** Validate an API-format prompt against object_info. Returns error strings. */
function validatePrompt(p: H.ApiPrompt): { errors: string[]; checks: number } {
  const errors: string[] = []; let checks = 0;
  for (const [id, n] of Object.entries(p)) {
    const info = OI[n.class_type]; checks++;
    if (!info) { errors.push(`${n.class_type}: not in object_info`); continue; }
    const spec: Record<string, any> = { ...(info.input.required ?? {}) }; const opt: Record<string, any> = { ...(info.input.optional ?? {}) };
    const allowed = new Set([...Object.keys(spec), ...Object.keys(opt)]); const req = new Set(Object.keys(spec));
    const autogrow: string[] = [];
    // dynamic combos: selected option's sub-inputs become `<name>.<field>`
    const todo = Object.keys({ ...spec, ...opt }); const done = new Set<string>();
    while (todo.length) { // dynamic combos (possibly nested): selected option's sub-inputs become `<name>.<field>`
      const k = todo.shift()!; const v = spec[k] ?? opt[k]; if (done.has(k) || v[0] !== 'COMFY_DYNAMICCOMBO_V3') continue; done.add(k);
      const sel = n.inputs[k]; const o = v[1].options.find((x: any) => x.key === sel); checks++;
      if (!o) { if (k in spec || sel !== undefined) errors.push(`${n.class_type}.${k}: '${sel}' not one of ${v[1].options.map((x: any) => x.key).join(', ')}`); continue; }
      const isReq = k in spec;
      for (const [kk, vv] of Object.entries<any>(o.inputs?.required ?? {})) { const key = `${k}.${kk}`; (isReq ? spec : opt)[key] = vv; allowed.add(key); if (isReq) req.add(key); todo.push(key); }
      for (const [kk, vv] of Object.entries<any>(o.inputs?.optional ?? {})) { const key = `${k}.${kk}`; opt[key] = vv; allowed.add(key); todo.push(key); }
    }
    for (const [k, v] of Object.entries({ ...spec, ...opt })) if (v[0] === 'COMFY_AUTOGROW_V3') { autogrow.push(k); req.delete(k); }
    for (const k of req) { checks++; if (!(k in n.inputs) && spec[k][0] !== 'COMFY_DYNAMICCOMBO_V3') errors.push(`${n.class_type}: missing required '${k}'`); else if (!(k in n.inputs)) errors.push(`${n.class_type}: missing required '${k}'`); }
    for (const [k, val] of Object.entries(n.inputs)) {
      checks++;
      const ag = autogrow.find((a) => k.startsWith(a + '.'));
      if (ag) { const names: string[] = ({ ...spec, ...opt })[ag][1]?.template?.names ?? []; const leaf = k.slice(ag.length + 1); if (names.length && !names.includes(leaf)) errors.push(`${n.class_type}.${k}: autogrow slot '${leaf}' not in ${names.slice(0, 3).join(',')}…`); continue; }
      if (!allowed.has(k)) { errors.push(`${n.class_type}: unknown input '${k}'`); continue; }
      const [t, o = {}] = ({ ...spec, ...opt })[k];
      if (Array.isArray(val) && val.length === 2 && typeof val[0] === 'string') { // link
        const src = p[val[0]]; const outT = src && OI[src.class_type]?.output?.[val[1] as number];
        if (!src) errors.push(`${n.class_type}.${k}: link to missing node ${val[0]}`); else if (outT !== t && !(t === 'COMBO')) errors.push(`${n.class_type}.${k}: link type ${outT} != ${t}`);
        continue;
      }
      if (t === 'COMFY_DYNAMICCOMBO_V3') continue;
      if ((n.class_type === 'LoadImage' && k === 'image') || (n.class_type === 'LoadVideo' && k === 'file')) continue; // upload names are dynamic
      if (t === 'COMBO' || Array.isArray(t)) { const opts = Array.isArray(t) ? t : o.options; if (!opts.includes(val)) errors.push(`${n.class_type}.${k}: '${val}' not in [${opts.slice(0, 6).join(', ')}${opts.length > 6 ? ', …' : ''}]`); continue; }
      if (PRIM[t]) { if (!PRIM[t](val)) { errors.push(`${n.class_type}.${k}: expected ${t}, got ${JSON.stringify(val)}`); continue; }
        if (o.min != null && (val as number) < o.min) errors.push(`${n.class_type}.${k}: ${val} < min ${o.min}`);
        if (o.max != null && (val as number) > o.max) errors.push(`${n.class_type}.${k}: ${val} > max ${o.max}`); continue; }
      errors.push(`${n.class_type}.${k}: literal given for socket type ${t}`);
    }
  }
  return { errors, checks };
}

/** Minimal JSON-schema check (type, required, enum, min/max, maxLength, additionalProperties:false). */
function check(s: any, v: any, at = 'body'): string[] {
  const e: string[] = [];
  if (s.enum && !s.enum.includes(v)) e.push(`${at}: ${JSON.stringify(v)} not in enum`);
  if (s.type === 'object') {
    if (typeof v !== 'object' || !v) return [`${at}: not an object`];
    for (const r of s.required ?? []) if (!(r in v)) e.push(`${at}.${r}: required`);
    for (const [k, x] of Object.entries(v)) { const ps = s.properties?.[k]; if (!ps) { if (s.additionalProperties === false) e.push(`${at}.${k}: not in documented schema`); continue; } e.push(...check(ps, x, `${at}.${k}`)); }
  }
  if (s.type === 'string' && typeof v !== 'string') e.push(`${at}: not a string`);
  if (s.type === 'integer' && !Number.isInteger(v)) e.push(`${at}: not an integer`);
  if (s.type === 'number' && typeof v !== 'number') e.push(`${at}: not a number`);
  if (s.type === 'boolean' && typeof v !== 'boolean') e.push(`${at}: not a boolean`);
  if (s.minimum != null && v < s.minimum) e.push(`${at}: ${v} < ${s.minimum}`);
  if (s.maximum != null && v > s.maximum) e.push(`${at}: ${v} > ${s.maximum}`);
  if (s.exclusiveMinimum != null && v <= s.exclusiveMinimum) e.push(`${at}: ${v} <= ${s.exclusiveMinimum}`);
  if (s.maxLength != null && typeof v === 'string' && v.length > s.maxLength) e.push(`${at}: longer than ${s.maxLength}`);
  return e;
}
const fixture = (f: string) => { const x = J(`fixtures/${f}`); if (!String(x._fixture).startsWith('HAND-WRITTEN')) throw new Error(`${f} not labelled`); return x; };
const expectThrow = (fn: () => unknown) => { try { fn(); return false; } catch { return true; } };

const INPUTS: H.GenInput[] = [
  { prompt: 'a red fox in snow, product shot', seed: 123456, aspectRatio: '16:9', width: 1344, height: 768, duration: 5, n: 1, text: 'Hello from OpenHiggsfield.' },
  { prompt: 'edge case', seed: Number.MAX_SAFE_INTEGER, aspectRatio: '21:9', width: 5000, height: 50, duration: 30, n: 20, resolution: '2K', images: ['a.png', 'b.png'], text: 'x'.repeat(12000) },
  { prompt: 'portrait', aspectRatio: '9:16', idempotencyKey: 'k'.repeat(300) },
];

// Validator self-test: known-bad prompts must fail (guards against a validator that passes everything).
{ const bad = [
  { 1: { class_type: 'MinimaxHailuo03TextToVideoNode', inputs: { model: 'MiniMax H3', 'model.prompt': 'x', 'model.resolution': '1080P', 'model.ratio': '16:9', 'model.duration': 5, seed: 1, watermark: false } } },
  { 1: { class_type: 'IdeogramV4', inputs: { prompt: 'x', resolution: 'Auto', rendering_speed: 'DEFAULT', seed: 2 ** 40 } } },
  { 1: { class_type: 'GrokImageNode', inputs: { model: 'grok-imagine-image-2.0', prompt: 'x', aspect_ratio: '1:1', number_of_images: 1 } } },
  { 1: { class_type: 'RecraftV4TextToImageNode', inputs: { prompt: 'x', negative_prompt: '', model: 'recraftv4_1', 'model.size': '1024x1024', n: 1, seed: 0, bogus: 1 } } },
]; for (const b of bad) if (!validatePrompt(b as any).errors.length) throw new Error('validator self-test failed: ' + JSON.stringify(b)); }
const rows: Row[] = [];
const seen = new Set<string>();
const provs: ProviderDef[] = [];
for (const t of listTools()) for (const id of t.providers) { const p = getProvider(id); if (p && !seen.has(id)) { seen.add(id); provs.push(p); } }

for (const p of provs.filter((x) => x.kind !== 'open-weights')) {
  const r: Row = { id: p.id, name: p.name, kind: p.kind, target: '', status: 'green', checks: 0, errors: [], notes: [] };
  if (/coming soon/i.test(p.via)) { rows.push({ ...r, status: 'amber', target: 'coming soon (no request is ever sent)', notes: ['coming-soon placeholder: every route refuses with a reason; unpriced'] }); continue; }
  if (p.kind === 'hosted' && H.ROUTER_MODELS[p.id]) {
    const m = H.ROUTER_MODELS[p.id]; r.target = `Router ${m.provider}/${m.model}`;
    if (HAS_CARDS && !CARDS.includes(`${m.provider}/${m.model}`)) r.errors.push(`Router id ${m.provider}/${m.model} not in the integration cards`);
    for (const i of INPUTS) {
      const c = H.routerCall(p.id, i); r.checks += 6;
      const rel = (u: string) => u.split('?')[0].replace(/^https:\/\/api\.comfy\.org/, '').replace(`/${m.provider}/${m.model}`, '/{provider}/{model}').replace('{request_id}', '{request_id}');
      for (const u of [c.plan.estimate.url, c.plan.submit.url, c.plan.poll?.url].filter(Boolean) as string[]) if (!SPEC.includes(`  ${rel(u)}:`)) r.errors.push(`URL ${rel(u)} not a path in router-openapi.yaml`);
      if (!('X-API-Key' in c.headers) && !('Authorization' in c.headers)) r.errors.push('no auth header');
      if (i.idempotencyKey && (c.headers['Idempotency-Key']?.length ?? 0) > 255) r.errors.push('Idempotency-Key > 255 (spec maxLength)');
      if (typeof c.body.seed === 'number' && c.body.seed > 2147483647) r.errors.push('seed exceeds int32');
    }
    const s = H.parseRouterSubmit(fixture('router-submit-201.json')); r.checks++;
    if (!s.statusUrl.endsWith('/status')) r.errors.push('fixture parse: status_url');
    const st = H.parseRouterStatus(fixture('router-status-in-progress.json'), fixture('router-status-in-progress.json')._headers['Retry-After']); r.checks++;
    if (st.done || st.retryAfterMs !== 5000) r.errors.push('status parse / Retry-After');
    const f = H.parseRouterStatus(fixture('router-status-failed.json')); r.checks++; if (!f.failed) r.errors.push('failed COMPLETED not detected');
    r.notes.push('Body fields beyond prompt/duration/aspect_ratio/resolution/seed/image unverified: per-model schema GET /v2/models/{p}/{m}/openapi.json needs a Comfy key (401 unauthenticated).');
    r.notes.push('routerPlan() composes the poll URL; spec says use status_url/response_url from the 201 (parseRouterSubmit does). No result-read step in RouterPlan.');
    if (r.errors.length === 0) r.status = 'amber';
  }
  if (p.kind === 'hosted' && p.nodes?.length) {
    r.target = (r.target ? r.target + ' + ' : '') + `node ${p.nodes.join(', ')}`;
    for (const nodeClass of p.nodes) {
      if (!OI[nodeClass]) { r.errors.push(`${nodeClass}: not in validator object_info`); continue; }
      if (HAS_CARDS && !CARDS.includes(nodeClass) && !/ComfyCloud/.test(nodeClass)) r.notes.push(`${nodeClass} not named in the integration cards (registered from docs.comfy.org partner-node index)`);
      if (!H.PARTNER_NODES[nodeClass]) { r.errors.push(`${nodeClass}: no request builder`); continue; }
      for (const i of INPUTS) { const v = validatePrompt(H.partnerNodePrompt(nodeClass, i)); r.checks += v.checks; r.errors.push(...v.errors.map((e) => `[seed=${i.seed ?? '-'} ar=${i.aspectRatio}] ${e}`)); }
    }
  }
  if (p.kind === 'hosted-direct') {
    const b = H.DIRECT_CLIENTS[p.id]; const schemaFile = { 'direct-minimax-speech': 'minimax-t2a-v2.json', 'direct-qwen3-tts': 'qwen-tts.json', 'direct-flux2-flex': 'bfl-flux-2-flex.json', 'direct-flux3-upscale': 'bfl-video-upscale.json' }[p.id];
    if (!b || !schemaFile) r.errors.push('no direct client / documented schema');
    else {
      const sc = J(`schemas/${schemaFile}`); r.target = `${sc.method} ${sc.url ?? sc.url_pattern}`;
      for (const i of INPUTS) {
        const req = b(i); r.checks += 3;
        if (req.method !== sc.method) r.errors.push(`method ${req.method}`);
        if (sc.url ? req.url !== sc.url : !new RegExp(sc.url_pattern).test(req.url)) r.errors.push(`url ${req.url}`);
        if (!(req.headers[sc.auth_header] ?? '').startsWith(sc.auth_prefix)) r.errors.push(`auth header ${sc.auth_header}`);
        r.errors.push(...check(sc.schema, req.body)); r.checks += Object.keys(req.body ?? {}).length;
      }
      if (p.id === 'direct-minimax-speech') { const ok = H.parseMinimaxSpeech(fixture('minimax-t2a-200.json')); if (!ok.isUrl) r.errors.push('fixture: url output'); if (!expectThrow(() => H.parseMinimaxSpeech(fixture('minimax-t2a-auth-error.json')))) r.errors.push('fixture: auth error not raised'); r.checks += 2; }
      if (p.id === 'direct-qwen3-tts') { H.parseQwenTts(fixture('qwen-tts-200.json')); r.checks++; r.notes.push('Endpoint is workspace-scoped (Singapore); needs OPENHIGGSFIELD_DASHSCOPE_WORKSPACE as well as the key. Voice id "Cherry" (Qwen3-TTS list) not checked against the live voice list.'); }
      if (p.id === 'direct-flux3-upscale') { H.parseBflSubmit(fixture('bfl-submit-200.json')); const rd = H.parseBflPoll(fixture('bfl-video-upscale-poll-ready.json')); if (!rd.done || !/\.mp4$/.test(rd.url ?? '')) r.errors.push('bfl video poll parse'); if (!H.parseBflPoll(fixture('bfl-poll-moderated.json')).error) r.errors.push('bfl moderated not an error');
        for (const mode of ['precise', 'creative']) { const b = H.bflVideoUpscaleRequest({ inputVideo: 'AAAA', factor: 2, mode, prompt: 'x' }).body!; r.errors.push(...check(sc.schema, b)); if (b.creativity !== (mode === 'creative' ? 1 : 0)) r.errors.push(`creativity for ${mode}`); } r.checks += 6; r.notes.push('Live client: server/src/providers/bfl.ts (submit + poll). Fixtures are HAND-WRITTEN from docs.'); }
      if (p.id === 'direct-flux2-flex') { H.parseBflSubmit(fixture('bfl-submit-200.json')); if (!H.parseBflPoll(fixture('bfl-poll-ready.json')).done || H.parseBflPoll(fixture('bfl-poll-pending.json')).done) r.errors.push('bfl poll parse'); r.checks += 3; }
      r.notes.push('Client builds the request only; provider run() is still hostedMock (no network by design).');
    }
  }
  for (const w of p.workflows ?? []) {
    const wf = JSON.parse(fs.readFileSync(path.join(HERE, '../../workflows', w), 'utf8')); const classes = Object.values<any>(wf).map((n) => n.class_type);
    const v = validatePrompt(wf); r.checks += v.checks; r.errors.push(...v.errors.map((e) => `${w}: ${e}`));
    const hostedIn = classes.filter((c) => OI[c]?.api_node); const miss = hostedIn.filter((c) => !(p.nodes ?? []).includes(c));
    if (miss.length) { r.notes.push(`${w} runs ${miss.join(', ')} but provider.nodes lists ${(p.nodes ?? []).join(', ')}`); if (r.status === 'green') r.status = 'amber'; }
  }
  if (!r.target) { r.errors.push('no request builder: no Router id, partner node or direct client'); }
  r.errors = [...new Set(r.errors)];
  if (r.errors.length) r.status = 'red';
  rows.push(r);
}
const open = listTools().flatMap((t) => t.providers.map((id) => getProvider(id)).filter((p): p is ProviderDef => !!p && p.kind === 'open-weights').map((p) => ({ tool: t.id, toolName: (t as any).name, provider: p.id, providerName: p.name, workflows: providerWorkflows(t, p), nodes: p.nodes ?? [] })));
const hostedTools = listTools().flatMap((t) => t.providers.filter((id) => getProvider(id)?.kind !== 'open-weights' && getProvider(id)).map((id) => ({ tool: t.id, provider: id })));
fs.writeFileSync(path.join(HERE, 'results.json'), JSON.stringify({ generated_by: 'npm run contracts:test', openWeights: open, hostedTools, fixtures: 'hand-written from public docs (labelled _fixture), not recorded live', rows }, null, 1));
for (const r of rows) console.log(`${r.status.padEnd(5)} ${r.id.padEnd(22)} ${String(r.checks).padStart(4)} checks  ${r.errors.slice(0, 3).join(' | ')}`);
{ // FLUX 3 Image Klein BFL route (a route of comfy-flux3-klein, not a provider)
  const sc = J('schemas/bfl-flux-3-image-klein.json'); const r: Row = { id: 'direct:bfl/flux-3-image-klein', name: 'FLUX 3 Klein via BFL API', kind: 'hosted-direct', target: `${sc.method} ${sc.url}`, status: 'green', checks: 0, errors: [], notes: ['Live client: server/src/providers/bfl.ts. Fixtures HAND-WRITTEN from docs.'] };
  for (const i of INPUTS) { const req = H.bflKleinRequest({ ...i, imageRes: '4K', images: ['AAAA', 'BBBB'] }); r.checks += 3; if (req.url !== sc.url) r.errors.push(`url ${req.url}`); if (!('x-key' in req.headers)) r.errors.push('auth'); r.errors.push(...check(sc.schema, req.body)); }
  const ten = H.bflKleinRequest({ prompt: 'x', images: Array.from({ length: 12 }, () => 'A') }).body!; if ((ten.images as string[]).length !== 10) r.errors.push('refs not capped at 10'); r.checks++;
  H.parseBflSubmit(fixture('bfl-submit-200.json')); if (!H.parseBflPoll(fixture('bfl-poll-ready.json')).done) r.errors.push('poll parse'); r.checks += 2;
  if (r.errors.length) r.status = 'red'; rows.push(r);
}
const red = rows.filter((r) => r.status === 'red').length; console.log(`${rows.length} hosted providers: ${rows.length - red} pass, ${red} red`);
process.exitCode = red ? 1 : 0;
