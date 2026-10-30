// Shared helpers for the video model health check (test/model-health.e2e.ts, test/model-health-ui.e2e.ts, scripts/model-health-report.mjs).
// Free and offline: nothing here calls a provider. Bodies are built by the app's own builders (the exact objects the runners send) and checked
// against the providers' published request schemas (OpenAPI documents saved locally), local graphs against ComfyUI /object_info.
// Schema folders (local, read only when present; a missing folder turns that check into "no schema here", never a failure):
//   MODEL_HEALTH_SCHEMAS or ROUTER_SCHEMAS_DIR: Comfy Router OpenAPI documents, docs.comfy.org.
//   MODEL_HEALTH_SCHEMAS_EXTRA: additional published request schemas. Defaults use the user's generic cache, never a private workspace.
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { createRequire } from 'node:module';

export const VIDEO_TOOLS = ['h3-video', 'app-transition', 'app-ugc-ad', 'object-swap', 'motion-transfer', 'restyle', 'reshoot', 'camera', 'photo-fx', 'app-orbit-shot', 'h3-extend', 'cinema', 'make-it-real'] as const;
/** Tools whose bar reads per-model video caps (videoLimits, providerModes): every mode × option is checked there. */
export const CAPS_TOOLS = new Set(['h3-video', 'app-transition', 'app-ugc-ad']);
const CACHE = path.join(os.homedir(), '.cache', 'openhiggsfield');
export const ROUTER_SCHEMA_DIR = process.env.MODEL_HEALTH_SCHEMAS || process.env.ROUTER_SCHEMAS_DIR || path.join(CACHE, 'router-schemas');
export const EXTRA_SCHEMA_DIR = process.env.MODEL_HEALTH_SCHEMAS_EXTRA || path.join(CACHE, 'extra-schemas');
export const SCHEMA_DIRS = [ROUTER_SCHEMA_DIR, EXTRA_SCHEMA_DIR];
export const schemaPath = (file: string) => SCHEMA_DIRS.map((d) => path.join(d, `${file}.json`)).find((f) => fs.existsSync(f)) ?? null;

// ---------------- request schemas ----------------
let Ajv: any = null; try { const req = createRequire(import.meta.url); Ajv = req('ajv/dist/2020.js').default ?? req('ajv/dist/2020.js'); } catch { /* no ajv: schema checks report "no validator" */ }
const compiled = new Map<string, { validate: any; schema: any; doc: any } | null>();
/** The request-body validator of one saved OpenAPI document (first POST path with a JSON body). null when the file or ajv is missing. */
export function validatorFor(file: string) {
  if (compiled.has(file)) return compiled.get(file)!;
  const f = schemaPath(file); if (!f || !Ajv) { compiled.set(file, null); return null; }
  const doc = JSON.parse(fs.readFileSync(f, 'utf8')); delete doc.openapi; const ajv = new Ajv({ strict: false, validateFormats: false, allErrors: true });
  const id = `mh-${file}`; ajv.addSchema({ ...doc, $id: id }); const p = Object.keys(doc.paths).find((x) => doc.paths[x]?.post?.requestBody)!;
  const esc = p.replace(/~/g, '~0').replace(/\//g, '~1'); const ref = `#/paths/${esc}/post/requestBody/content/application~1json/schema`;
  const validate = ajv.compile({ $ref: `${id}${ref}` });
  const deref = (s: any): any => { if (s?.$ref) { let x: any = doc; for (const k of s.$ref.replace(/^#\//, '').split('/')) x = x?.[k.replace(/~1/g, '/').replace(/~0/g, '~')]; return deref(x); } return s; };
  const out = { validate, schema: deref(doc.paths[p].post.requestBody.content['application/json'].schema), doc }; compiled.set(file, out); return out;
}
export const schemaErrors = (v: { validate: any }, body: unknown): string | null => (v.validate(body) ? null : (v.validate.errors ?? []).slice(0, 4).map((e: any) => `${e.instancePath || '/'} ${e.message}${e.params?.allowedValues ? ` (${e.params.allowedValues.join(', ')})` : ''}`).join('; '));

/** Which saved schema a route's body follows. strip = fields our direct call adds that the saved (Router) form fills from the URL path. */
export function schemaFor(route: { routeId: string; kind: string; direct?: any }, engine: string, routerId?: string): { file: string; strip?: string[]; note?: string; soft?: boolean } | null {
  if (route.kind === 'comfy-router' && routerId) return { file: routerId.replace('/', '__') };
  if (route.kind === 'fal') { const slug = route.routeId.replace(/^fal:/, '').replace(/#.*$/, ''); return { file: `fal__${slug.replace(/\//g, '_')}` }; }
  const BYTEPLUS: Record<string, string> = { 'direct-seedance-25': 'dreamina-seedance-2-5-260628', 'direct-seedance-20-fast': 'dreamina-seedance-2-0-fast-260128', 'direct-seedance-20-mini': 'dreamina-seedance-2-0-mini', 'router-seedance': 'dreamina-seedance-2-0-260128' };
  if (route.kind !== 'local' && route.direct) {
    const prov = String(route.direct.provider ?? '');
    if (prov === 'byteplus' && BYTEPLUS[engine]) return { file: `byteplus__${BYTEPLUS[engine]}`, note: 'BytePlus ModelArk body vs the same BytePlus schema Comfy Router publishes' };
    if (prov === 'bfl' && /flux3-video/.test(engine)) return { file: 'bfl__flux-3-video', note: 'BFL body vs the BFL schema Comfy Router publishes' };
    if (prov === 'ltx') return { file: 'ltx__ltx-2-5-pro', note: 'LTX v2 body vs the LTX schema Comfy Router publishes (text to video form; image fields are not in that document)', soft: true };
    if (prov === 'minimax' && /h3/.test(engine)) return { file: 'minimax__minimax-h3', note: 'MiniMax v2 body vs the MiniMax schema Comfy Router publishes', soft: true };
  }
  return null;
}

// ---------------- ComfyUI graphs vs /object_info ----------------
const isLink = (v: any) => Array.isArray(v) && v.length === 2 && typeof v[0] === 'string' && typeof v[1] === 'number';
/** Model-file pickers: their choices are whatever is installed on that ComfyUI, so a missing file is a note (download it), not a wiring bug. */
export const FILE_INPUT = /(ckpt|unet|vae|clip|lora|model|text_encoder|upscale|audio_vae|gguf|weights|file|image|video|audio)(_name)?\d*$/i;
export function graphIssues(g: Record<string, any>, OI: Record<string, any>): { errors: string[]; notes: string[] } {
  const errors: string[] = []; const notes: string[] = [];
  for (const [id, n] of Object.entries<any>(g)) {
    const spec = OI[n.class_type]; if (!spec) { errors.push(`node ${id}: class ${n.class_type} is not in /object_info`); continue; }
    const all = { ...(spec.input?.required ?? {}), ...(spec.input?.optional ?? {}) };
    for (const k of Object.keys(spec.input?.required ?? {})) if (!(k in (n.inputs ?? {})) && !Object.keys(n.inputs ?? {}).some((x) => x.startsWith(`${k}.`)) /* dynamic / autogrow inputs arrive as <parent>.<child> (ComfyMathExpression values.a) */) errors.push(`${n.class_type}.${k} (required) missing`);
    for (const [k, v] of Object.entries<any>(n.inputs ?? {})) {
      if (k.includes('.')) continue; // dynamic combo children
      const s = all[k]; if (!s) { errors.push(`${n.class_type}.${k} is not an input of this node`); continue; }
      if (isLink(v)) { if (!g[v[0]]) errors.push(`${n.class_type}.${k} links to missing node ${v[0]}`); continue; }
      if (v && typeof v === 'object' && '__file' in v) continue;
      const [type, o = {}] = s;
      const choices: any[] | null = Array.isArray(type) ? type : type === 'COMBO' ? (o.options ?? []).map((x: any) => (typeof x === 'object' ? x.key : x)) : null;
      if (choices) { if (choices.length && !choices.includes(v)) (FILE_INPUT.test(k) ? notes : errors).push(`${n.class_type}.${k}=${JSON.stringify(v)} not among ${choices.length} choices${FILE_INPUT.test(k) ? ' (model file not installed on this ComfyUI)' : ''}`); continue; }
      if (type === 'INT' || type === 'FLOAT') { if (typeof v !== 'number') { errors.push(`${n.class_type}.${k} is not a number`); continue; }
        if (o.min != null && v < o.min) errors.push(`${n.class_type}.${k}=${v} < min ${o.min}`); if (o.max != null && v > o.max) errors.push(`${n.class_type}.${k}=${v} > max ${o.max}`); continue; }
      if (type === 'STRING' && typeof v !== 'string') errors.push(`${n.class_type}.${k} is not text`);
      if (type === 'BOOLEAN' && typeof v !== 'boolean') errors.push(`${n.class_type}.${k} is not a boolean`);
    }
  }
  return { errors, notes };
}

// ---------------- what the body really asks for ----------------
/** Our tier names and the providers' spellings, as a picture height (Kling std/pro = 720/1080, BFL hd/fhd, LTX 1280x720 …). */
export function resHeight(v: unknown): number | null {
  const s = String(v ?? '').trim().toLowerCase(); if (!s) return null;
  const named: Record<string, number> = { std: 720, pro: 1080, hd: 720, fhd: 1080, qhd: 1440, uhd: 2160, '2k': 1440, '4k': 2160 };
  if (named[s]) return named[s]; const wh = s.match(/^(\d+)x(\d+)$/); if (wh) return Math.min(+wh[1], +wh[2]); const p = s.match(/^(\d{3,4})p$/); return p ? +p[1] : null;
}
const ratioOf = (v: unknown): string | null => { const s = String(v ?? ''); const wh = s.match(/^(\d+)x(\d+)$/); if (wh) { const g = (a: number, b: number): number => (b ? g(b, a % b) : a); const d = g(+wh[1], +wh[2]); return `${+wh[1] / d}:${+wh[2] / d}`; } return s || null; };
/** Duration / resolution / ratio / sound fields of a provider body (top level, `parameters`, or Kling's strings). */
export function sentOf(body: any): { duration?: number; res?: number | null; ratio?: string | null; audio?: boolean } {
  const P = { ...(body ?? {}), ...(body?.parameters ?? {}) }; const o: any = {};
  for (const k of ['duration', 'durationSeconds', 'duration_seconds']) if (P[k] != null && Number.isFinite(Number(P[k]))) { o.duration = Number(P[k]); break; }
  if (P.resolution != null) o.res = resHeight(P.resolution); else if (P.mode === 'std' || P.mode === 'pro') o.res = resHeight(P.mode);
  if (/^\d+x\d+$/.test(String(P.resolution ?? ''))) o.ratio = ratioOf(P.resolution);
  for (const k of ['ratio', 'aspect_ratio', 'aspectRatio']) if (P[k] != null) { o.ratio = String(P[k]); break; }
  for (const k of ['generate_audio', 'generateAudio', 'audio']) if (typeof P[k] === 'boolean') { o.audio = P[k]; break; }
  if (P.sound === 'on' || P.sound === 'off') o.audio = P.sound === 'on';
  return o;
}
/** Does the body run what was picked? Returns one sentence per silent change (asked 15 s, sent 10 s …). */
export function faithIssues(asked: { duration?: number; resolution?: string; aspect?: string; audio?: boolean; audioOff?: string; mode?: string }, body: any): string[] {
  const s = sentOf(body); const out: string[] = [];
  if (asked.duration != null && s.duration != null && s.duration !== asked.duration) out.push(`duration: picked ${asked.duration} s, body sends ${s.duration}`);
  const want = resHeight(asked.resolution); if (want && s.res && s.res !== want && !(want === 720 && s.res === 768) /* H3: 720p runs as 768p, said in the quote */) out.push(`resolution: picked ${asked.resolution}, body sends ${s.res}p`);
  const a = asked.aspect; const framed = asked.mode === 'i2v' || asked.mode === 'flf';
  if (a && a !== 'auto' && !framed && s.ratio && s.ratio !== a) out.push(`aspect: picked ${a}, body sends ${s.ratio}`);
  if (asked.audio != null && asked.audioOff !== 'strip' && s.audio != null && s.audio !== asked.audio) out.push(`sound: picked ${asked.audio ? 'on' : 'off'}, body sends ${s.audio ? 'on' : 'off'}`);
  return out;
}
/** Enum values a provider schema accepts for duration / resolution / ratio (top level or under `parameters`), for the "hidden option" notes. */
export function schemaChoices(v: { schema: any; doc: any } | null): { durations?: number[]; res?: number[]; ratios?: string[] } {
  if (!v) return {}; const deref = (s: any): any => { if (s?.$ref) { let x: any = v.doc; for (const k of s.$ref.replace(/^#\//, '').split('/')) x = x?.[k]; return deref(x); } return s; };
  const props = { ...(deref(v.schema)?.properties ?? {}), ...(deref(deref(v.schema)?.properties?.parameters)?.properties ?? {}) }; const o: any = {};
  const en = (k: string) => { const p = deref(props[k]); return p?.enum ?? p?.anyOf?.flatMap((x: any) => deref(x)?.enum ?? []) ?? null; };
  for (const k of ['duration', 'durationSeconds']) { const e = en(k); if (e?.length) { o.durations = e.map(Number); break; } const p = deref(props[k]); if (p?.minimum != null && p?.maximum != null) { o.durations = Array.from({ length: p.maximum - p.minimum + 1 }, (_, i) => p.minimum + i); break; } }
  const r = en('resolution'); if (r?.length) o.res = [...new Set(r.map(resHeight).filter(Boolean) as number[])];
  for (const k of ['ratio', 'aspect_ratio', 'aspectRatio']) { const e = en(k); if (e?.length) { o.ratios = e.map(String); break; } }
  return o;
}

// ---------------- known findings ----------------
/** Known compatibility findings. A NEW failure fails the test; a known one that no longer
 *  happens is reported so it can be removed here. Key: `<check>|<tool>|<routeId>|<mode>` (a trailing * matches any rest). */
export const KNOWN: Record<string, string> = {
  'limits|h3-video|replicate:minimax/h3|r2v': 'Replicate H3 Reference to video always sends ratio adaptive, while the route lists 7 aspects (no Replicate schema saved to confirm r2v takes a ratio)',
  'submit|app-ugc-ad|comfy-cloud:cloud-h3|*': 'UGC Ad locks 9:16; MiniMax H3 on its Comfy Cloud API-node place takes Auto only (samples-only place; pinning it → 400)',
  'limits|camera|comfy-router:api-minimax-h3|*': 'app bars offer 480p / 720p / 1080p; MiniMax H3 has 768P / 2K, so 480p runs as 768P and 1080p as 2K (priced as run)',
  'limits|photo-fx|comfy-router:api-minimax-h3|*': 'as Camera Moves: 480p → 768P, 1080p → 2K on MiniMax H3',
  'limits|app-orbit-shot|comfy-router:api-minimax-h3|*': 'as Camera Moves: 480p → 768P, 1080p → 2K on MiniMax H3',
  'limits|camera|comfy-router:comfy-h3-camera|*': 'H3 Camera Motion on Comfy Router (5bc53d48) always sends 768P and is priced at 768P: 480p (no 480P on Router H3) and 1080p (2K not wired on this place) run as 768P',
  'limits|h3-extend|comfy-router:comfy-h3-extend|*': 'H3 Extend · via last frame on Comfy Router (5bc53d48) sends 768P (Router H3 has 768P / 2K, no 480P), priced at 768P',
  'limits|camera|fal:minimax/h3/image-to-video#camera|*': 'Camera Moves offers 480p / 720p / 1080p; the fal H3 camera place runs 768P for anything but 480p',
  'ui|app-ugc-ad|cloud-h3|*': 'UGC Ad locks 9:16; MiniMax H3 on its Comfy Cloud API-node place takes Auto only (submit 400)',
};
export const knownFor = (key: string) => Object.keys(KNOWN).find((k) => (k.endsWith('*') ? key.startsWith(k.slice(0, -1)) : k === key)) ?? null;

export type Row = { tool: string; model: string; modelName: string; engine: string; routeId: string; routeKind: string; wired: boolean; mode: string;
  cases: number; schema: 'pass' | 'fail' | 'n/a'; schemaNote?: string; limits: 'pass' | 'fail'; price: 'pass' | 'fail'; submit: 'pass' | 'fail'; verified?: boolean | null;
  failures: string[]; notes: string[]; resultChecked?: boolean; minQuote?: { credits: number; usd: number | null; seconds?: number; resolution?: string; aspect?: string; audio?: boolean; source?: string } | null };
