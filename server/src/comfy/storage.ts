/**
 * Comfy storage upload: a local file → a public, signed download link that Comfy Router models fetch themselves. For schemas that take a
 * clip or image only as a URL (Kling 3.0 Omni Edit video_list, Seedance reference / edit video, Wan 2.7, HappyHorse, Genjutsu…), never as a data URI.
 *
 * The contract is the one ComfyUI's own partner nodes use (comfy_api_nodes/util/upload_helpers.py, upload_file_to_comfyapi + upload_file):
 *  1. POST {base}/customers/storage  {file_name: "<uuid>.<ext>", content_type: "<mime>"}  with the Comfy key (X-API-KEY)
 *     → {upload_url, download_url}.
 *  2. PUT the bytes to upload_url (a pre-signed URL: NO key, Content-Type = the same mime, or none at all when there is no mime).
 *     Retries: up to 3 more tries on 408 / 429 / 500 / 502 / 503 / 504 or a network error, 1 s then ×2 (the node's max_retries / retry_delay / retry_backoff).
 *  3. Use download_url in the request body.
 * Seedance (comfy_api_nodes/nodes_bytedance.py, _seedance_virtual_library_upload_video_asset): the download_url is then registered in the caller's
 * Seedance virtual library, POST {base}/proxy/seedance/virtual-library/assets {url, hash: sha256 of the bytes, asset_type: "Video"} → {asset_id},
 * polled at GET {base}/proxy/seedance/assets/{id} every 5 s until status "Active" ("Failed" = refused), and sent as asset://<id>.
 *
 * - The key is only ever sent to the Comfy base (routerBase(): https://api.comfy.org; OPENHIGGSFIELD_COMFY_ROUTER_URL in tests). Never logged.
 * - Same bytes + same mime → the same link for CACHE_MS (the life of a job and its retries), so passes and versions upload once.
 * - Errors are RouterErrors with one plain sentence: they happen before any model call, so nothing was sent to the model.
 * - The node sets no size or expiry rule of its own; per-model limits are checked by the callers (routerModels.ts).
 */
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { routerBase, RouterError } from '../comfyRouter.js';
import { keyValue } from '../routing/keys.js';

const MIME: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg', '.flac': 'audio/flac' };
export const storageMimeOf = (p: string) => MIME[path.extname(p).toLowerCase()] ?? 'application/octet-stream';
/** How long an uploaded link is reused for the same bytes (a job, its passes, versions and retries). */
export const CACHE_MS = 30 * 60_000;
const RETRY_STATUS = new Set([408, 429, 500, 502, 503, 504]);
const MAX_RETRIES = 3; const RETRY_DELAY_MS = 1000; const RETRY_BACKOFF = 2;
/** Seedance asset polling (the node: every 5 s; we stop after 10 min instead of its 100). */
export const SEEDANCE_POLL_MS = 5000; export const SEEDANCE_POLL_MAX = 120;

/** Tests: inject fetch / sleep (routing/routerRun.ts setRouterFetch sets both, so one fake serves Router and storage). */
let testFetch: typeof fetch | null = null; let testSleep: ((ms: number) => Promise<void>) | null = null;
export const setStorageFetch = (f: typeof fetch | null, sleep: ((ms: number) => Promise<void>) | null = null) => { testFetch = f; testSleep = sleep; };
const cache = new Map<string, { value: string; at: number }>(); const inflight = new Map<string, Promise<string>>();
export const clearStorageCache = () => { cache.clear(); inflight.clear(); };

const comfyKey = () => keyValue({ envKey: 'COMFY_API_KEY', envAliases: [] });
const fetchOf = () => testFetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
const sleepOf = () => testSleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
const fail = (msg: string, status: number | null, detail: string, temporary = false) =>
  new RouterError(status === 401 ? 'key_invalid' : status === 402 ? 'cloud_credits' : status === 403 ? 'cloud_plan' : 'upload_failed',
    status === 401 ? 'the Comfy key was not accepted for the upload (it is missing, wrong or revoked). Check the key in Settings.'
      : status === 402 ? 'your Comfy account is out of credits, so the file could not be uploaded. Add credits on comfy.org, then try again.'
      : status === 403 ? "your Comfy plan doesn't allow uploads for partner models; Standard or higher is needed." : msg, status, null, temporary, detail.slice(0, 500));

/** A call to the Comfy API with the key (only ever to the Comfy base). Retries 429 / 5xx / network errors like the node does. */
async function comfyCall(url: string, init: RequestInit, what: string, key: string): Promise<Response> {
  const base = new URL(routerBase()); if (new URL(url).origin !== base.origin) throw fail('the upload was refused (wrong host).', null, `${what}: refused to send the key to ${new URL(url).origin}`);
  const f = fetchOf(); const sleep = sleepOf(); let delay = RETRY_DELAY_MS;
  for (let attempt = 0; ; attempt++) {
    let r: Response;
    try { r = await f(url, { ...init, headers: { ...(init.headers as Record<string, string> | undefined), 'X-API-KEY': key } }); }
    catch (e) { if (attempt < MAX_RETRIES) { await sleep(delay); delay *= RETRY_BACKOFF; continue; } throw fail('Comfy storage could not be reached, so your file was not uploaded. Check your connection, then try again.', null, `${what}: ${e instanceof Error ? e.message : e}`, true); }
    if (r.ok) return r;
    if (RETRY_STATUS.has(r.status) && attempt < MAX_RETRIES) { await r.arrayBuffer().catch(() => null); await sleep(delay); delay *= RETRY_BACKOFF; continue; }
    const body = await r.text().catch(() => '');
    throw fail(`Comfy storage refused the upload (HTTP ${r.status}).`, r.status, `${what} → ${r.status} ${body}`, RETRY_STATUS.has(r.status));
  }
}

/** PUT the bytes to the pre-signed upload URL: no key, Content-Type = mime. Same retry rule as the node. */
async function putSigned(uploadUrl: string, bytes: Buffer, mime: string | null): Promise<void> {
  const f = fetchOf(); const sleep = sleepOf(); let delay = RETRY_DELAY_MS;
  for (let attempt = 0; ; attempt++) {
    let r: Response;
    try { r = await f(uploadUrl, { method: 'PUT', body: new Uint8Array(bytes), headers: mime ? { 'Content-Type': mime } : {} }); }
    catch (e) { if (attempt < MAX_RETRIES) { await sleep(delay); delay *= RETRY_BACKOFF; continue; } throw fail('your file could not be uploaded to Comfy storage (network error). Try again.', null, `put: ${e instanceof Error ? e.message : e}`, true); }
    await r.arrayBuffer().catch(() => null);
    if (r.ok) return;
    if (RETRY_STATUS.has(r.status) && attempt < MAX_RETRIES) { await sleep(delay); delay *= RETRY_BACKOFF; continue; }
    throw fail(`your file could not be uploaded to Comfy storage (HTTP ${r.status}). Try again.`, r.status === 401 || r.status === 402 || r.status === 403 ? null : r.status, `put → ${r.status}`, RETRY_STATUS.has(r.status));
  }
}

const httpsUrl = (u: unknown): u is string => { try { return typeof u === 'string' && new URL(u).protocol === 'https:'; } catch { return false; } };
const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex');
/** One cached, de-duplicated value per key (two passes asking for the same file at once share one upload). */
async function cached(key: string, make: () => Promise<string>): Promise<string> {
  const hit = cache.get(key); if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  const running = inflight.get(key); if (running) return running;
  const p = make().then((v) => { cache.set(key, { value: v, at: Date.now() }); return v; }).finally(() => inflight.delete(key));
  inflight.set(key, p); return p;
}

/** Bytes → Comfy storage → the public download URL. */
async function uploadBytes(bytes: Buffer, mime: string | null, ext: string, key: string): Promise<string> {
  const r = await comfyCall(`${routerBase()}/customers/storage`, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(mime ? { file_name: `${randomUUID()}.${ext}`, content_type: mime } : { file_name: `${randomUUID()}.${ext}` }) }, 'storage', key);
  let j: any = null; try { j = await r.json(); } catch { /* below */ }
  if (!httpsUrl(j?.upload_url) || !httpsUrl(j?.download_url)) throw fail('Comfy storage gave an unexpected answer, so your file was not uploaded. Try again.', null, `storage → ${r.status} without https upload_url / download_url`, true);
  await putSigned(j.upload_url, bytes, mime);
  return j.download_url;
}

const needKey = () => { const k = comfyKey(); if (!k) throw new RouterError('key_invalid', 'this model takes your file as a link, and uploading it needs your Comfy key. Add it in Settings.', null, null, false, 'no COMFY_API_KEY'); return k; };
const extOf = (p: string, mime: string | null) => path.extname(p).slice(1).toLowerCase() || (mime?.split('/')[1] ?? 'bin');

/** A local file (video / image / audio) → its public Comfy storage URL. mime defaults to the file's extension. */
export async function uploadToComfyStorage(filePath: string, mime: string | null = storageMimeOf(filePath)): Promise<string> {
  const key = needKey(); const bytes = await readFile(filePath); const hash = sha256(bytes);
  return cached(`url:${hash}:${mime ?? ''}`, () => uploadBytes(bytes, mime, extOf(filePath, mime), key));
}

/** Seedance: upload, then register in the caller's Seedance virtual library and wait until Active → "asset://<id>" (the official node's flow). */
export async function uploadSeedanceAsset(filePath: string, assetType: 'Video' | 'Image' = 'Video', mime: string | null = storageMimeOf(filePath)): Promise<string> {
  const key = needKey(); const bytes = await readFile(filePath); const hash = sha256(bytes);
  return cached(`seedance:${hash}:${assetType}`, async () => {
    const url = await cached(`url:${hash}:${mime ?? ''}`, () => uploadBytes(bytes, mime, extOf(filePath, mime), key));
    const r = await comfyCall(`${routerBase()}/proxy/seedance/virtual-library/assets`, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(assetType === 'Image' ? { url, hash } : { url, hash, asset_type: assetType }) }, 'seedance asset', key);
    let j: any = null; try { j = await r.json(); } catch { /* below */ }
    const id = typeof j?.asset_id === 'string' && /^[\w.-]{1,200}$/.test(j.asset_id) ? j.asset_id : null;
    if (!id) throw fail('Seedance could not register your file, so nothing was sent to the model. Try again.', null, `seedance asset → ${r.status} without asset_id`, true);
    const sleep = sleepOf();
    for (let n = 0; n < SEEDANCE_POLL_MAX; n++) {
      const s = await comfyCall(`${routerBase()}/proxy/seedance/assets/${encodeURIComponent(id)}`, { method: 'GET' }, 'seedance asset status', key);
      let a: any = null; try { a = await s.json(); } catch { /* keep polling */ }
      if (a?.status === 'Active') return `asset://${id}`;
      if (a?.status === 'Failed') throw fail(`Seedance refused your ${assetType === 'Video' ? 'clip' : 'image'}${a?.error?.message ? ` (${String(a.error.message).slice(0, 160)})` : ''}, so nothing was sent to the model.`, null, `seedance asset ${id} Failed ${JSON.stringify(a?.error ?? null)}`);
      await sleep(SEEDANCE_POLL_MS);
    }
    throw fail('Seedance took too long to prepare your file, so nothing was sent to the model. Try again.', null, `seedance asset ${id} not Active after ${SEEDANCE_POLL_MAX} polls`, true);
  });
}
