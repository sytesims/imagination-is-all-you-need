/**
 * BH9 (f) / B2-minimal: Comfy Cloud API v2 over plain REST (fetch only; no SDK). Same shape as ComfyNative
 * (upload / run / download) so runNative() runs our own workflow graphs on Comfy Cloud unchanged.
 *   POST /api/v2/assets (multipart file, content_type, file_path) → Asset {id}; the graph gets {"__type":"core/ASSET","info":{id}} on the loader widget
 *   POST /api/v2/jobs {workflow} + Idempotency-Key → Job {id}; the id is stored at once (onSubmitted) and only ever POLLED, never resubmitted
 *   GET  /api/v2/jobs/{id} → {status queued|running|succeeded|failed|expired|canceling|canceled, progress{value}, outputs[], error}
 *   GET  {output.url} (auth) → 302 to a signed URL (fetched without the key) → saved into DATA_DIR. The Cloud URL never reaches the browser.
 *   POST /api/v2/jobs/{id}/cancel on cancel / timeout, and for orphans (B7: a job whose server process died is cancelled on Cloud at boot).
 *   A 404 on the status poll = the remote job is gone (cloud_job_gone): the run stops and run.ts puts the credits back.
 *   422 idempotency_key_reuse on submit = an earlier submit with this key may have created the job: never resent (submit_uncertain).
 *   Error envelope codes per docs.comfy.org/api-reference/v2 (Job status page, ErrorEnvelope): 429 queue_full / rate_limited / deployment_* = back off.
 * Auth: Authorization: Bearer <COMFY_API_KEY>. The key is never logged or put in an error.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { NativeOutput, NativeProgress } from './native.js';
import { sanitizeProviderText } from '../comfyRouter.js';

export type CloudReason = 'key_invalid' | 'cloud_credits' | 'workflow_invalid' | 'queue_full' | 'submit_uncertain' | 'cloud_job_failed' | 'cloud_timeout' | 'cloud_unreachable' | 'content_blocked' | 'cloud_job_gone' | 'upload_failed';
/** A Comfy Cloud failure with a plain message (no key, no URL; it follows "Comfy Cloud failed: ") and our reason code. temporary = retrying the same route may work. */
export class CloudError extends Error {
  /** What Comfy Cloud said (sanitised): the ErrorEnvelope code / message and, for a refused graph, its per-node errors; null when nothing was said. */
  provider: CloudFailure | null = null;
  constructor(readonly reasonCode: CloudReason, message: string, readonly httpStatus: number | null = null, readonly temporary = false, readonly detail: string | null = null) { super(message); }
}
/** Comfy Cloud's own words for a failure, kept on the job as providerError (the same field the Router runs fill, comfyRouter.ts). */
export interface CloudFailure { errorType: string | null; httpStatus: number | null; upstreamStatus: null; detail: string | null; upstreamDetail: string | null; refusalSubject: null; requestId: string | null; step: string; nodeErrors?: string[] }
/** ComfyUI node_errors ({id: {class_type, errors: [{type, message, details, extra_info: {input_name}}]}}) → one short sanitised line per error. */
export function nodeErrorLines(ne: unknown): string[] {
  if (!ne || typeof ne !== 'object') return [];
  const out: string[] = [];
  for (const [id, n] of Object.entries<any>(ne)) for (const er of Array.isArray(n?.errors) ? n.errors : []) {
    const input = er?.extra_info?.input_name; const t = sanitizeProviderText(`node ${id} ${n?.class_type ?? ''}: ${er?.message ?? er?.type ?? 'error'}${er?.details ? ` (${er.details})` : ''}${input && !String(er?.details ?? '').includes(input) ? ` [${input}]` : ''}`, 240);
    if (t) out.push(t); if (out.length >= 12) return out; }
  return out;
}
/** ErrorEnvelope {error: {code, message, details}} (docs.comfy.org/api-reference/v2) or a ComfyUI /prompt style {error, node_errors} → CloudFailure. */
export function cloudFailureFrom(status: number | null, body: string | Record<string, any> | null, step: string, requestId: string | null = null): CloudFailure | null {
  let j: any = body; if (typeof body === 'string') { try { j = JSON.parse(body); } catch { j = null; } }
  const e = j?.error && typeof j.error === 'object' ? j.error : j; const d = e?.details ?? j?.details ?? null;
  const nodeErrors = nodeErrorLines(d?.node_errors ?? j?.node_errors ?? (d && typeof d === 'object' && Object.values(d).some((x: any) => Array.isArray(x?.errors)) ? d : null));
  const code = sanitizeProviderText(e?.code ?? e?.type ?? (typeof j?.error === 'string' ? null : null), 80);
  const msg = sanitizeProviderText(e?.message ?? (typeof j?.error === 'string' ? j.error : null) ?? (j == null && typeof body === 'string' && body.trim() && !/^\s*</.test(body) ? body : null), 400);
  const extra = !nodeErrors.length && d && typeof d === 'object' ? sanitizeProviderText(d, 300) : null;
  if (!code && !msg && !nodeErrors.length && !extra) return null;
  return { errorType: code, httpStatus: status, upstreamStatus: null, detail: msg, upstreamDetail: nodeErrors.length ? nodeErrors.join('; ') : extra, refusalSubject: null, requestId, step, ...(nodeErrors.length ? { nodeErrors } : {}) };
}
/** Shared catch for every Comfy Cloud runner (routing/cloudRun.ts, the Topaz and Tripo partner nodes): reason + error type on the job, Cloud's own
 *  words kept as job.providerError (sanitised), one log line, and the plain Error the router shows. "label" names the runner in the log. */
export function cloudFailure(job: any, e: CloudError, label: string): Error {
  job.errorType = e.temporary ? 'temporary' : 'provider_outage'; job.reasonCode = e.reasonCode;
  if (e.provider) job.providerError = { ...e.provider, model: label, at: Date.now() };
  console.error(`[openhiggsfield] comfy cloud ${job.id} (${label}): ${e.reasonCode}${e.httpStatus ? ` (${e.httpStatus})` : ''} ${sanitizeProviderText(e.detail ?? '', 600) ?? ''}${e.provider ? ` | Comfy said: ${JSON.stringify(e.provider)}` : ''}`);
  const said = e.provider ? (e.provider.nodeErrors?.[0] ?? e.provider.detail) : null;
  const err = new Error(said && (e.reasonCode === 'workflow_invalid' || e.reasonCode === 'upload_failed' || e.reasonCode === 'cloud_job_failed') ? `${e.message.replace(/\.$/, '')}. Comfy said: ${said.replace(/\.$/, '')}` : e.message.replace(/\.$/, ''));
  if (e.reasonCode === 'cloud_timeout') (err as any).timeout = true; return err;
}
const MIME: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.flac': 'audio/flac' };
const EXT: Record<string, string> = Object.fromEntries(Object.entries(MIME).map(([e, m]) => [m, e]));
/** HTTP status → our reason. */
export function cloudErrorFor(status: number, what: string, body = ''): CloudError {
  const e = cloudErrorForBare(status, what, body); e.provider = cloudFailureFrom(status, body, what); return e;
}
function cloudErrorForBare(status: number, what: string, body: string): CloudError {
  const code = (() => { try { return String(JSON.parse(body)?.error?.code ?? ''); } catch { return ''; } })();
  if (status === 401 || status === 403 || code === 'sso_required') return new CloudError('key_invalid', 'the API key was not accepted (it is missing, wrong or revoked). Check the key in Settings.', status, false, `${what} → ${status}`);
  if (status === 402) return new CloudError('cloud_credits', 'the Comfy Cloud account is out of credits or has no active plan.', status, false, `${what} → 402`);
  if (status === 451 || code === 'content_blocked' || code === 'input_blocked') return new CloudError('content_blocked', 'this content was blocked.', status, false, `${what} → ${status} ${code}`);
  if (status === 422 && code === 'idempotency_key_reuse') return new CloudError('submit_uncertain', 'an earlier attempt may already have started this job, so it was not sent again.', status, true, `${what} → 422 ${code}`);
  if (status === 429) return new CloudError('queue_full', 'the queue is full right now. Try again in a minute.', status, true, `${what} → 429 ${code}`);
  // an upload refused is not a graph problem: say so (2026-10-26, the Topaz upload sent its metadata after the file and Cloud refused it with 422)
  if (what === 'upload' && (status === 400 || status === 409 || status === 413 || status === 422)) return new CloudError('upload_failed', 'the upload to Comfy Cloud failed, so nothing was run.', status, false, `${what} → ${status} ${code} ${body.slice(0, 400)}`);
  if (status === 400 || status === 404 || status === 409 || status === 422) return new CloudError('workflow_invalid', 'this workflow could not run there (Comfy refused the graph before running it).', status, false, `${what} → ${status} ${code} ${body.slice(0, 400)}`);
  return new CloudError('cloud_unreachable', 'it had a server problem.', status, true, `${what} → ${status} ${code}`);
}

export class ComfyCloudV2 {
  readonly base: string; private n = 0;
  /** idemPrefix: stable per job attempt (e.g. `${jobId}-a1`), so a duplicate submit of the same pass is rejected by Cloud instead of billed twice. */
  constructor(base: string, private readonly key: string, private readonly idemPrefix: string, private readonly f: typeof fetch = (...a) => fetch(...a), private readonly pollMs = 3000) { this.base = base.replace(/\/+$/, ''); }
  private auth(h: Record<string, string> = {}) { return this.key ? { ...h, Authorization: `Bearer ${this.key}` } : { ...h }; } // a keyless comfy-api-proxy sends no header
  private async call(p: string, init: RequestInit, what: string) {
    let r: Response; try { r = await this.f(this.base + p, { ...init, headers: this.auth(init.headers as any) }); }
    catch (e) { throw new CloudError('cloud_unreachable', 'it could not be reached.', null, true, `${what}: ${e instanceof Error ? e.message : e}`); }
    if (!r.ok) throw cloudErrorFor(r.status, what, await r.text().catch(() => ''));
    return r;
  }
  /** Upload one input file; returns the core/ASSET reference for the loader widget. */
  async upload(file: string): Promise<any> {
    // Comfy Cloud streams the upload and reads only the fields BEFORE `file`: content_type and file_path first, the file part last, or it is
    // refused with 422 "content_type is required and must be sent before the file field" (docs: upload-an-asset-single-call-multipart, "Nothing
    // after the file field is read"; the official @comfyorg/sdk 0.5.0 postAssets appends them in this order).
    const fd = new FormData(); const ct = MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
    fd.append('content_type', ct); fd.append('file_path', path.basename(file)); fd.append('file', new Blob([await readFile(file)], { type: ct }), path.basename(file));
    const a = await (await this.call('/api/v2/assets', { method: 'POST', body: fd, headers: { 'Idempotency-Key': `${this.idemPrefix}-u${this.n++}` } }, 'upload')).json() as any;
    if (!a?.id) throw new CloudError('cloud_unreachable', 'the upload was not confirmed.', null, true, 'upload: no id');
    return { __type: 'core/ASSET', info: { id: a.id, ...(a.hash ? { hash: a.hash } : {}), file_path: a.file_path ?? path.basename(file) } };
  }
  /** Best effort: true when Cloud accepted the cancel (or the job is already gone), false on any other failure. Never throws. */
  async cancel(id: string): Promise<boolean> {
    try { await this.call(`/api/v2/jobs/${encodeURIComponent(id)}/cancel`, { method: 'POST' }, 'cancel'); return true; }
    catch (e) { return e instanceof CloudError && e.httpStatus === 404; }
  }
  /** One status read: the job object, or null when Cloud no longer has it (404). Throws CloudError otherwise. */
  async status(id: string): Promise<any | null> {
    try { return await (await this.call(`/api/v2/jobs/${encodeURIComponent(id)}`, { method: 'GET' }, 'status')).json(); }
    catch (e) { if (e instanceof CloudError && e.httpStatus === 404) return null; throw e; }
  }
  /** Submit once, store the id (onSubmitted), then poll. An ambiguous submit (network error / 5xx / timeout) is NOT resent. */
  /** partnerAuth: the graph has partner (API) nodes (Topaz, Tripo…): the Comfy key goes once in extra_data.api_key_comfy_org, as the official SDK sends it
   *  (docs: Cloud API reference › Using Partner Nodes). Only to this same Comfy host, never logged; without it a partner node has no credential. */
  async run(workflow: Record<string, any>, o: { onProgress?: (p: NativeProgress) => void; onSubmitted?: (id: string) => void; isCanceled?: () => boolean; timeoutMs?: number; partnerAuth?: boolean } = {}) {
    let id: string;
    try {
      const body = { workflow, ...(o.partnerAuth && this.key ? { extra_data: { api_key_comfy_org: this.key } } : {}) };
      const r = await this.call('/api/v2/jobs', { method: 'POST', headers: { 'content-type': 'application/json', 'Idempotency-Key': `${this.idemPrefix}-p${this.n++}` }, body: JSON.stringify(body) }, 'submit');
      id = String(((await r.json()) as any)?.id ?? '');
    } catch (e) {
      if (e instanceof CloudError && (e.reasonCode === 'cloud_unreachable')) throw new CloudError('submit_uncertain', 'the job was not confirmed, so it was not sent again.', e.httpStatus, true, e.detail);
      throw e;
    }
    if (!id) throw new CloudError('submit_uncertain', 'no job id came back, so the job was not sent again.', null, true, 'submit: no id');
    o.onSubmitted?.(id);
    const t0 = Date.now(); const total = Object.keys(workflow).length; let misses = 0;
    for (;;) {
      if (o.isCanceled?.()) { await this.cancel(id); throw new Error('canceled'); }
      if (Date.now() - t0 > (o.timeoutMs ?? 30 * 60_000)) { await this.cancel(id); const e = new CloudError('cloud_timeout', 'it took too long; the job was cancelled.', null, true, `job ${id} timeout`); (e as any).timeout = true; throw e; }
      let j: any = null;
      try { j = await (await this.call(`/api/v2/jobs/${encodeURIComponent(id)}`, { method: 'GET' }, 'status')).json(); misses = 0; }
      catch (e) {
        if (e instanceof CloudError && e.httpStatus === 404) throw new CloudError('cloud_job_gone', 'the job is no longer there, so it was stopped.', 404, false, `job ${id} → 404`); // B7: remote prompt gone
        if (e instanceof CloudError && !e.temporary) throw e; if (++misses > 20) throw e; } // poll errors: keep polling the SAME id
      const s = String(j?.status ?? '');
      if (s === 'queued' || s === 'running' || s === 'canceling') { const v = Number(j?.progress?.value) || 0; o.onProgress?.({ node: j?.progress?.current_node ?? null, value: v, max: 1, done: Number(j?.progress?.nodes_done) || 0, total, percent: Math.min(99, Math.round(v * 100)), known: v > 0 /* Comfy Cloud's own progress value; 0 = nothing reported yet */, phase: s === 'queued' ? 'queued' : 'generating' }); }
      else if (s === 'succeeded') {
        const outputs: Record<string, any[]> = {};
        for (const x of j.outputs ?? []) (outputs[String(x.node_id)] ??= []).push({ filename: x.name ?? `${x.id}${EXT[x.content_type] ?? ''}`, subfolder: '', type: 'output', kind: x.type, url: x.url, content_type: x.content_type, id: x.id });
        o.onProgress?.({ node: null, value: 1, max: 1, done: total, total, percent: 100, known: true, phase: 'finishing' }); return { promptId: id, outputs };
      }
      else if (s === 'canceled') throw new Error('canceled');
      else if (s === 'expired') throw new CloudError('cloud_timeout', 'the job expired before it ran.', null, true, `job ${id} expired`);
      else if (s === 'failed') { const er = j?.error ?? {}; const ce = new CloudError('cloud_job_failed', 'the workflow failed while running.', null, true, `job ${id}: ${er.code ?? ''} ${er.class_type ?? ''} ${String(er.message ?? '').slice(0, 300)}`);
        ce.provider = cloudFailureFrom(null, { error: { code: er.code ?? null, message: [er.class_type, er.message].filter(Boolean).join(': ') || null, details: er.details ?? null } }, 'job', id); throw ce; }
      await new Promise((r) => setTimeout(r, this.pollMs));
    }
  }
  /** Output url (auth) → 302 signed URL → fetched WITHOUT the key → dest. */
  async download(o: NativeOutput & { url?: string }, dest: string) {
    if (!o.url) throw new CloudError('cloud_job_failed', 'a result came back without a download link.', null, true, 'output: no url');
    const u = /^https?:/.test(o.url) ? o.url : this.base + o.url;
    let r: Response; try { r = await this.f(u, { headers: this.auth(), redirect: 'manual' }); } catch (e) { throw new CloudError('cloud_unreachable', 'the result could not be downloaded.', null, true, String(e)); }
    if (r.status >= 300 && r.status < 400 && r.headers.get('location')) r = await this.f(new URL(r.headers.get('location')!, u).toString());
    if (!r.ok) throw cloudErrorFor(r.status, 'download');
    await writeFile(dest, Buffer.from(await r.arrayBuffer())); return dest;
  }
}
