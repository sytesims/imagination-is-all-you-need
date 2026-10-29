/**
 * Media hand-off (2026-10-26): THE one step that turns a local file (image, video, audio) into what a cloud provider's request field takes.
 * Every hosted body builder calls handOff() (or handOffBytes() for multipart) instead of reading and encoding files itself; the static guard in
 * test/prompt-refs-coverage.test.ts fails when a module under src/ encodes a file inline on its own.
 *
 *   handOff(file, kind, provider, { accepts })  → a string in one of the forms the field accepts:
 *     'url'       a public link: the server's own public address (OPENHIGGSFIELD_PUBLIC_BASE_URL + /files/<name>) when set, else the provider's
 *                 own upload (Comfy storage, fal CDN, Replicate Files API), cached per file hash + provider for the upload's lifetime;
 *                 Seedance (seedanceAsset) registers the Comfy storage link as a Seedance asset (asset://<id>, the official node's flow).
 *     'data-uri'  data:<mime>;base64,<bytes>
 *     'base64'    the bare base64 string
 *   The policy table below says, per provider, how big a file may go inline, when a link is preferred, and the hard per-file limit; each figure
 *   carries its source. mediaIssue(route, input) runs the same size rules without reading or uploading anything, so routing/select.ts refuses a
 *   too-big file at quote and submit ("This clip is 210 MB; fal takes up to 94.4 MB per file"), before any provider call.
 *
 * Comfy Cloud graphs upload their inputs with the Comfy Cloud upload API (comfy/cloudV2.ts upload()), the documented way for workflows
 * (docs.comfy.org/development/cloud/api-reference "Uploading Inputs"); that path stays in the cloud client because it needs the run's client.
 */
import { createHash } from 'node:crypto';
import { statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from './env.js';
import { DATA_DIR } from './config.js';
import { uploadToComfyStorage, uploadSeedanceAsset, CACHE_MS as COMFY_CACHE_MS } from './comfy/storage.js';

export type MediaKind = 'image' | 'video' | 'audio';
export type HandOffForm = 'url' | 'data-uri' | 'base64';
export type HandOffProvider = 'comfy-router' | 'fal' | 'replicate' | 'byteplus' | 'bfl' | 'minimax' | 'ltx' | 'google' | 'openai';
export interface HandOffOpts {
  /** Forms the request field takes, from its schema (default: the provider's usual forms for that kind). */ accepts?: HandOffForm[];
  /** Content type (default: from the extension). */ mime?: string;
  /** Model name for messages ("Kling 3.0 Omni Edit takes this clip as a link…"). */ who?: string;
  /** Seedance on Comfy Router: register the upload as a Seedance asset (asset://). */ seedanceAsset?: boolean;
}

/** A refusal before anything was sent (too big, or no way to make a link). Thrown at body build; mediaIssue() gives the same line at quote. */
export class HandOffError extends Error { constructor(message: string, public code: 'too_big' | 'needs_link' | 'upload_failed' | 'missing') { super(message); } }

const MIME: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.bmp': 'image/bmp',
  '.tif': 'image/tiff', '.tiff': 'image/tiff', '.heic': 'image/heic', '.heif': 'image/heif', '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg', '.flac': 'audio/flac' };
const FALLBACK: Record<MediaKind, string> = { image: 'image/png', video: 'video/mp4', audio: 'audio/mpeg' };
export const mimeOfFile = (p: string, kind?: MediaKind) => MIME[path.extname(p).toLowerCase()] ?? (kind ? FALLBACK[kind] : 'application/octet-stream');
export const kindOfFile = (p: string): MediaKind => { const m = MIME[path.extname(p).toLowerCase()] ?? ''; return m.startsWith('video/') ? 'video' : m.startsWith('audio/') ? 'audio' : 'image'; };
const MiB = 1024 * 1024;
const mb = (n: number) => `${Math.round(n / 1e5) / 10} MB`;
const NOUN: Record<MediaKind, string> = { image: 'image', video: 'clip', audio: 'audio file' };

// ---------------------------------------------------------------- policy per provider
type PerKind = Partial<Record<MediaKind, number>>;
interface Policy {
  name: string;
  /** Forms a field takes when the caller doesn't say. */ accepts: Record<MediaKind, HandOffForm[]>;
  /** Largest file sent inline (unset = no documented limit). Above it the file must go as a link. */ inlineMax: PerKind;
  /** When the field also takes a link and one can be made: inline only up to this size (the provider's recommendation). */ preferInlineMax: PerKind;
  /** Hard per-file limit whatever the form (unset = none documented; the provider's own refusal applies). */ maxBytes: PerKind;
  /** The provider's own upload (key env names + upload); unset = only the public address makes a link. */ upload?: { keyEnv: string[]; run: Uploader };
  docs: string[];
}
type Uploader = (u: { file: string; bytes: Buffer; mime: string; key: string }) => Promise<{ url: string; ttlMs: number }>;
const ALL = (n: number): PerKind => ({ image: n, video: n, audio: n });
const INLINE_OR_URL: HandOffForm[] = ['data-uri', 'url'];

/** fal CDN single-shot upload limit (the official JS client sends files up to 90 MiB in one PUT, larger ones in chunks, which this app doesn't do). */
export const FAL_UPLOAD_MAX = 90 * MiB;
/** Lifetime we ask fal to keep an upload (X-Fal-Object-Lifecycle), and how long we reuse its link (half of it: a long job still finds it alive). */
export const FAL_UPLOAD_TTL_S = 86_400; const FAL_REUSE_MS = (FAL_UPLOAD_TTL_S * 1000) / 2;
/** Replicate: "Use a data URL when you have a small file <= 256kb"; larger files go through the Files API. */
export const REPLICATE_INLINE_MAX = 256_000;
/** Comfy Router body cap 100 MiB; base64 adds 4/3 → about 75 MB of media per request (docs.comfy.org/development/comfy-router/limitations). */
export const ROUTER_INLINE_MAX = 75_000_000;

let testFetch: typeof fetch | null = null;
/** Tests: inject fetch for the fal / Replicate uploads (Comfy storage has its own: comfy/storage.ts setStorageFetch). */
export const setHandoffFetch = (f: typeof fetch | null) => { testFetch = f; };
const fetchOf = () => testFetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));

const falUpload: Uploader = async ({ file, bytes, mime, key }) => {
  // fal-js libs/client/src/storage.ts: POST {rest}/storage/upload/initiate?storage_type=fal-cdn-v3 {content_type, file_name} → {upload_url, file_url}; PUT bytes
  const f = fetchOf(); const name = `${createHash('sha256').update(bytes).digest('hex').slice(0, 16)}${path.extname(file).toLowerCase() || ''}`;
  const r = await f('https://rest.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3', { method: 'POST',
    headers: { Authorization: `Key ${key}`, 'Content-Type': 'application/json', 'X-Fal-Object-Lifecycle': JSON.stringify({ expiration_duration_seconds: FAL_UPLOAD_TTL_S }) },
    body: JSON.stringify({ content_type: mime, file_name: name }) });
  if (!r.ok) throw new HandOffError(r.status === 401 || r.status === 403 ? 'fal did not accept your key for the upload. Check the fal key in Settings.' : `fal refused the upload (HTTP ${r.status}), so nothing was sent to the model. Try again.`, 'upload_failed');
  const j: any = await r.json().catch(() => null);
  if (!httpsUrl(j?.upload_url) || !httpsUrl(j?.file_url)) throw new HandOffError('fal gave an unexpected answer to the upload, so nothing was sent to the model. Try again.', 'upload_failed');
  const p = await f(j.upload_url, { method: 'PUT', body: new Uint8Array(bytes), headers: { 'Content-Type': mime } }); await p.arrayBuffer().catch(() => null);
  if (!p.ok) throw new HandOffError(`your file could not be uploaded to fal (HTTP ${p.status}), so nothing was sent to the model. Try again.`, 'upload_failed');
  return { url: j.file_url, ttlMs: FAL_REUSE_MS };
};
const replicateUpload: Uploader = async ({ file, bytes, mime, key }) => {
  // Replicate Files API: POST /v1/files multipart {content, filename, type} → { urls: { get }, expires_at }
  const fd = new FormData(); const name = path.basename(file).slice(-200);
  fd.append('content', new Blob([new Uint8Array(bytes)], { type: mime }), name); fd.append('filename', name); fd.append('type', mime);
  const r = await fetchOf()('https://api.replicate.com/v1/files', { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: fd });
  if (!r.ok) throw new HandOffError(r.status === 401 || r.status === 403 ? 'Replicate did not accept your token for the upload. Check it in Settings.' : r.status === 413 ? `Replicate refused the file as too large (${mb(bytes.length)}).` : `Replicate refused the upload (HTTP ${r.status}), so nothing was sent to the model. Try again.`, r.status === 413 ? 'too_big' : 'upload_failed');
  const j: any = await r.json().catch(() => null); const url = j?.urls?.get;
  if (!httpsUrl(url)) throw new HandOffError('Replicate gave an unexpected answer to the upload, so nothing was sent to the model. Try again.', 'upload_failed');
  const exp = Date.parse(String(j?.expires_at ?? '')); const left = Number.isFinite(exp) ? exp - Date.now() : 0;
  return { url, ttlMs: left > 0 ? Math.max(0, left - 60 * 60_000) || left / 2 : 30 * 60_000 }; // reuse until an hour before it expires; unknown expiry: 30 min
};
const comfyUpload: Uploader = async ({ file, mime }) => ({ url: await uploadToComfyStorage(file, mime), ttlMs: COMFY_CACHE_MS });

export const HANDOFF_POLICY: Record<HandOffProvider, Policy> = {
  'comfy-router': { name: 'Comfy Router',
    // most Router image / audio fields take inline data (the model page says which); video fields that take only a link pass accepts ['url']
    accepts: { image: ['data-uri'], video: ['data-uri', 'url'], audio: ['data-uri'] },
    inlineMax: ALL(ROUTER_INLINE_MAX), preferInlineMax: { image: 20_000_000, audio: 20_000_000, video: 0 }, maxBytes: {},
    upload: { keyEnv: ['COMFY_API_KEY'], run: comfyUpload },
    docs: ['https://docs.comfy.org/development/comfy-router/limitations#request-bodies-are-capped', 'comfy_api_nodes/util/upload_helpers.py (POST /customers/storage)'] },
  fal: { name: 'fal', accepts: { image: INLINE_OR_URL, video: INLINE_OR_URL, audio: INLINE_OR_URL },
    inlineMax: {}, preferInlineMax: ALL(256_000), maxBytes: ALL(FAL_UPLOAD_MAX),
    upload: { keyEnv: ['OPENHIGGSFIELD_FAL_KEY', 'FAL_KEY'], run: falUpload },
    docs: ['https://fal.ai/docs/documentation/model-apis/fal-cdn ("not recommended for files larger than a few KB")', 'https://github.com/fal-ai/fal-js/blob/main/libs/client/src/storage.ts'] },
  replicate: { name: 'Replicate', accepts: { image: INLINE_OR_URL, video: INLINE_OR_URL, audio: INLINE_OR_URL },
    inlineMax: {}, preferInlineMax: ALL(REPLICATE_INLINE_MAX), maxBytes: {},
    upload: { keyEnv: ['OPENHIGGSFIELD_REPLICATE_API_TOKEN', 'REPLICATE_API_TOKEN'], run: replicateUpload },
    docs: ['https://replicate.com/docs/reference/http#predictions.create (data URL <= 256kb, else an HTTP URL)', 'https://sdks.replicate.com/python/resources/files/'] },
  // ModelArk create task: image_url URL | data:image/<fmt>;base64 | asset:// (≤ 30 MB per image, 64 MB per request); video_url public URL or asset:// only;
  // audio_url URL or base64. No upload API of ours here: a video goes as the public address or a Comfy storage link (both are public HTTPS links).
  byteplus: { name: 'BytePlus ModelArk', accepts: { image: ['data-uri'], video: ['url'], audio: ['data-uri'] },
    inlineMax: { image: 30_000_000, audio: 30_000_000 }, preferInlineMax: {}, maxBytes: {},
    upload: { keyEnv: ['COMFY_API_KEY'], run: comfyUpload },
    docs: ['https://docs.byteplus.com/en/docs/ModelArk/1520757', 'https://docs.byteplus.com/en/docs/ModelArk/1541523'] },
  bfl: { name: 'Black Forest Labs', accepts: { image: ['base64'], video: ['base64'], audio: [] }, inlineMax: {}, preferInlineMax: {}, maxBytes: {},
    docs: ['https://docs.bfl.ml/api-reference (images: http(s) URL or base64)'] },
  minimax: { name: 'MiniMax', accepts: { image: ['data-uri'], video: ['data-uri'], audio: ['data-uri'] }, inlineMax: {}, preferInlineMax: {}, maxBytes: {},
    docs: ['https://platform.minimax.io/docs (first_frame_image / reference media: URL or data URL)'] },
  ltx: { name: 'LTX', accepts: { image: ['data-uri'], video: ['data-uri'], audio: ['data-uri'] }, inlineMax: {}, preferInlineMax: {}, maxBytes: {},
    docs: ['https://docs.ltx.video (image_uri: URL or data URI)'] },
  // Gemini: inline image data, the whole request up to 20 MB (larger files need the Files API, not used: our references are photos)
  google: { name: 'Google Gemini', accepts: { image: ['base64'], video: [], audio: [] }, inlineMax: { image: 20_000_000 }, preferInlineMax: {}, maxBytes: {},
    docs: ['https://ai.google.dev/gemini-api/docs/image-understanding (inline data: total request size up to 20 MB)'] },
  // OpenAI image edits: multipart image[] files, each under 50 MB
  openai: { name: 'OpenAI', accepts: { image: ['base64'], video: [], audio: [] }, inlineMax: {}, preferInlineMax: {}, maxBytes: { image: 50_000_000 },
    docs: ['https://platform.openai.com/docs/api-reference/images/createEdit (each image under 50 MB)'] },
};

// ---------------------------------------------------------------- helpers
const httpsUrl = (u: unknown): u is string => { try { return typeof u === 'string' && new URL(u).protocol === 'https:'; } catch { return false; } };
/** The server's own public address (OPENHIGGSFIELD_PUBLIC_BASE_URL): files under the data dir are served at <base>/files/<name>. */
export const publicBase = () => (env('PUBLIC_BASE_URL') ?? process.env.OPENHIGGSFIELD_PUBLIC_BASE_URL ?? '').replace(/\/$/, '');
const keyOf = (p: Policy) => p.upload?.keyEnv.map((k) => process.env[k]?.trim()).find(Boolean);
const resolveFile = (f: string) => (path.isAbsolute(f) ? f : path.join(DATA_DIR, f));
const sizeOf = (f: string) => { try { return statSync(resolveFile(f)).size; } catch { return -1; } };
const who = (p: Policy, o: HandOffOpts) => o.who ?? p.name;

/** Can a link be made for this provider right now (public address, Comfy key for Seedance assets, or the provider's own upload with its key)? */
export const canLink = (provider: HandOffProvider, o: HandOffOpts = {}) => !!publicBase() || !!keyOf(HANDOFF_POLICY[provider]) || (!!o.seedanceAsset && !!process.env.COMFY_API_KEY?.trim());

type Plan = { form: HandOffForm; via?: 'public' | 'upload' | 'asset' };
/** What hand-off a file of `bytes` gets (no I/O). Throws HandOffError when it can't go at all. */
function plan(bytes: number, kind: MediaKind, provider: HandOffProvider, o: HandOffOpts, link = canLink(provider, o)): Plan {
  const p = HANDOFF_POLICY[provider]; const accepts = o.accepts ?? p.accepts[kind]; const n = NOUN[kind];
  const hard = p.maxBytes[kind]; if (hard != null && bytes > hard) throw new HandOffError(`This ${n} is ${mb(bytes)}; ${p.name} takes up to ${mb(hard)} per file. Use a shorter or smaller ${n}.`, 'too_big');
  const inlineForm = accepts.find((f) => f !== 'url'); const inlineMax = p.inlineMax[kind] ?? Infinity;
  const inlineOk = !!inlineForm && bytes <= inlineMax; const urlOk = accepts.includes('url');
  const viaLink = (): Plan => ({ form: 'url', via: o.seedanceAsset && process.env.COMFY_API_KEY?.trim() ? 'asset' : publicBase() ? 'public' : 'upload' });
  if (urlOk && link && (!inlineOk || bytes > (p.preferInlineMax[kind] ?? Infinity))) return viaLink();
  if (inlineOk) return { form: inlineForm! };
  if (urlOk) throw new HandOffError(`${who(p, o)} takes this ${n} as a link${provider === 'comfy-router' || provider === 'byteplus' ? ', uploaded with your Comfy key: add the key in Settings' : p.upload ? `, uploaded with your ${p.name} key: add it in Settings` : ': set the server\'s public address (OPENHIGGSFIELD_PUBLIC_BASE_URL)'}${!link && inlineForm ? ` (inline it takes up to ${mb(inlineMax)}; yours is ${mb(bytes)})` : ''}.`, 'needs_link');
  if (inlineForm) throw new HandOffError(`This ${n} is ${mb(bytes)}; ${who(p, o)} takes up to ${mb(inlineMax)} per file. Use a shorter or smaller ${n}.`, 'too_big');
  throw new HandOffError(`${who(p, o)} doesn't take ${kind} files here.`, 'needs_link');
}

/** Why this file can't be handed to the provider (null = fine). No reads, no uploads: quote / submit checks. */
export function handOffIssue(file: string, kind: MediaKind, provider: HandOffProvider, o: HandOffOpts = {}): string | null {
  const b = sizeOf(file); if (b < 0) return null; // not on disk (yet): the body build reports a missing file
  try { plan(b, kind, provider, o); return null; } catch (e) { return e instanceof HandOffError ? e.message : String(e); }
}

const cache = new Map<string, { value: string; until: number }>(); const inflight = new Map<string, Promise<string>>();
export const clearHandoffCache = () => { cache.clear(); inflight.clear(); };
let uploads = 0; /** Tests: how many real uploads ran (cache hits don't count). */ export const handoffUploads = () => uploads;

/** The file in the form the provider's field takes (see the header). Throws HandOffError before any model call when it can't go. */
export async function handOff(file: string, kind: MediaKind, provider: HandOffProvider, o: HandOffOpts = {}): Promise<string> {
  const abs = resolveFile(file); const bytes0 = sizeOf(abs); if (bytes0 < 0) throw new HandOffError(`Your ${NOUN[kind]} (${path.basename(file)}) is missing on the server; add it again.`, 'missing');
  const pl = plan(bytes0, kind, provider, o); const mime = o.mime ?? mimeOfFile(abs, kind);
  if (pl.form !== 'url') { const b64 = (await readFile(abs)).toString('base64'); return pl.form === 'base64' ? b64 : `data:${mime};base64,${b64}`; }
  if (pl.via === 'public') return `${publicBase()}/files/${path.basename(abs)}`;
  if (pl.via === 'asset') return uploadSeedanceAsset(abs, kind === 'image' ? 'Image' : 'Video', mime);
  const P = HANDOFF_POLICY[provider]; const key = keyOf(P)!;
  const bytes = await readFile(abs); const id = `${provider}:${createHash('sha256').update(bytes).digest('hex')}:${mime}`;
  const hit = cache.get(id); if (hit && Date.now() < hit.until) return hit.value;
  const running = inflight.get(id); if (running) return running;
  const job = (async () => { uploads++; const r = await P.upload!.run({ file: abs, bytes, mime, key }); cache.set(id, { value: r.url, until: Date.now() + r.ttlMs }); return r.url; })().finally(() => inflight.delete(id));
  inflight.set(id, job); return job;
}
/** Multipart bodies (OpenAI image edits): the bytes, after the same size rules. */
export async function handOffBytes(file: string, kind: MediaKind, provider: HandOffProvider, o: HandOffOpts = {}): Promise<Buffer> {
  const abs = resolveFile(file); const b = sizeOf(abs); if (b < 0) throw new HandOffError(`Your ${NOUN[kind]} (${path.basename(file)}) is missing on the server; add it again.`, 'missing');
  plan(b, kind, provider, { ...o, accepts: ['base64'] }); return readFile(abs);
}

// ---------------------------------------------------------------- route-level check (quote and submit)
/** The provider a route hands media to (null: local graphs, Comfy Cloud graphs and routes with no media). */
export function providerOfRoute(r: { kind?: string; vendor?: string; direct?: { provider?: string } }): HandOffProvider | null {
  if (r.kind === 'fal' || r.kind === 'replicate' || r.kind === 'comfy-router') return r.kind;
  const d = r.direct?.provider ?? r.vendor; return d && d in HANDOFF_POLICY ? (d as HandOffProvider) : null;
}
const list = (x: unknown): string[] => (Array.isArray(x) ? x.filter((p): p is string => typeof p === 'string' && !!p) : typeof x === 'string' && x ? [x] : []);
/** The media files a job carries, by kind (the input field names every tool uses). */
export function mediaFilesOf(i: Record<string, any>): { file: string; kind: MediaKind }[] {
  const out: { file: string; kind: MediaKind }[] = []; const add = (xs: string[], kind: MediaKind) => { for (const f of xs) if (!out.some((o) => o.file === f)) out.push({ file: f, kind }); };
  add(list(i.videoPath), 'video'); add(list(i.refVideoPaths), 'video');
  add([...list(i.imagePath), ...list(i.lastFramePath), ...list(i.maskPath), ...list(i.refPaths)], 'image');
  add([...list(i.speechPath), ...list(i.refAudioPaths)], 'audio');
  return out;
}
/** Why this job's files can't reach this route's provider (null = fine): checked with the route's other refusals (routing/select.ts), so the quote and
 *  the submit say it before any call. Uses the provider's default field forms; a body that sends a stricter form re-checks at build. */
export function mediaIssue(r: { kind?: string; vendor?: string; direct?: { provider?: string } }, i: Record<string, any>): string | null {
  const p = providerOfRoute(r); if (!p) return null;
  for (const { file, kind } of mediaFilesOf(i)) { const bad = handOffIssue(file, kind, p); if (bad) return bad; }
  return null;
}
