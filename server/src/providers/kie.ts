/**
 * kie.ai task client (place-kie, installable). kie.ai is a RESELLER: models, prices and terms may change without notice (its terms of use cover
 * the website only). Built only from its docs (read 2026-11-06; no key, no live call yet):
 *   create  POST {base}/api/v1/jobs/createTask  { model, input, callBackUrl? } → { code, msg, data: { taskId } }
 *           https://docs.kie.ai/market/google/nanobanana2 · https://docs.kie.ai/market/bytedance/seedance-2-5
 *   poll    GET  {base}/api/v1/jobs/recordInfo?taskId=… → { code, msg, data: { state: waiting|queuing|generating|success|fail, resultJson
 *           ('{"resultUrls":[…]}', a JSON string), failCode, failMsg, creditsConsumed, costTime } }   https://docs.kie.ai/market/common/get-task-detail
 *   upload  POST {uploadBase}/api/file-stream-upload (multipart: file, uploadPath, fileName) → { success, code, data: { downloadUrl } }; files are
 *           deleted after 24 h. https://docs.kie.ai/file-upload-api/upload-file-stream (the page's curl uses kieai.redpandaai.co; its text says
 *           api.kie.ai: uploadBaseUrl is a setting)
 *   auth    Authorization: Bearer $KIE_KEY
 * Errors come back as HTTP 200 with a code in the body (200 ok · 401 key · 402 out of credits · 404 · 408 no result in 10 min · 422 validation ·
 * 429 rate limited · 455 maintenance · 500 server · 501 generation failed · 505 feature disabled), so every answer is read for `code`.
 * Results are kept 14 days: routing/run.ts downloads each one as soon as the task succeeds. There is no cancel call.
 */
import fs from 'node:fs/promises'; import path from 'node:path';
import { BusyError, withBusyRetry } from '../busyRetry.js';
import { PollTolerance, MISS, httpError, HOSTED_POLL_MS } from '../hostedPoll.js';
import { PlaceError, type PlaceErrorClass, type PlaceCost } from '../services/places.js';
import { mimeOfFile } from '../mediaHandoff.js';

type Fetch = typeof fetch;
export const KIE_BASE = 'https://api.kie.ai';
export const KIE_UPLOAD_BASE = 'https://kieai.redpandaai.co';
/** kie.ai credits per US dollar (https://kie.ai/pricing: "1 credit ≈ $0.005"). */
export const KIE_CREDITS_PER_USD = 200;
/** How long kie keeps generated files (get-task-detail: "Generated files are kept for 14 days"). */
export const KIE_RESULT_TTL_DAYS = 14;
export interface KieRecord { taskId?: string; model?: string; state?: 'waiting' | 'queuing' | 'generating' | 'success' | 'fail' | string; resultJson?: string | null;
  failCode?: string | null; failMsg?: string | null; creditsConsumed?: number | null; costTime?: number | null }
const H = (key: string) => ({ Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' });
const trim = (b: string) => b.replace(/\/+$/, '');
export const kieRecordUrl = (base: string, id: string) => `${trim(base)}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(id)}`;

/** A body code (createTask / recordInfo / a failed task's failCode) → our class. */
export function kieCodeClass(code: number): PlaceErrorClass {
  if (code === 402) return 'out_of_credit';
  if (code === 422 || code === 400) return 'bad_input';
  if (code === 429) return 'rate_limited';
  if (code === 408 || code === 455 || code === 500 || code === 501 || code === 505) return 'provider_down';
  return 'unknown'; // 401 (the key), 404, 433 (undocumented)
}
/** A task that ended in state fail → our class (its failMsg first: a safety refusal is moderation whatever the code). */
export function kieFailClass(r: KieRecord): PlaceErrorClass {
  if (/sensitive|nsfw|safety|moderat|policy|inappropriate|prohibited/i.test(String(r.failMsg ?? ''))) return 'moderation';
  const c = kieCodeClass(Number(r.failCode)); return c === 'unknown' ? 'provider_down' : c;
}
/** The error for a 200-with-a-code body. 408 / 455 / 500 and 429 are worth another try; 501 / 505 are not. */
export function kieBodyError(where: string, j: { code?: number; msg?: string }): PlaceError {
  const code = Number(j.code); const cls = kieCodeClass(code);
  const msg = code === 401 ? `kie.ai didn’t accept the key (401): ${j.msg ?? ''}` : `kie.ai ${where} ${code}: ${j.msg ?? ''}`;
  return new PlaceError(msg.trim(), cls, { status: code, temporary: [408, 429, 455, 500].includes(code) });
}
async function readBody(where: string, r: Response): Promise<any> {
  if (!r.ok) throw httpError(`kie.ai ${where} HTTP ${r.status}`, r.status); // kie answers 200 for its own errors; another status came from in front of it
  return r.json();
}

export async function kieCreate(base: string, model: string, input: Record<string, unknown>, key: string, f: Fetch = fetch): Promise<string> {
  const j = await readBody('createTask', await f(`${trim(base)}/api/v1/jobs/createTask`, { method: 'POST', headers: H(key), body: JSON.stringify({ model, input }) }));
  if (Number(j?.code) === 429) throw new BusyError(`kie.ai createTask 429: ${String(j.msg ?? '')}`, 429, null); // refused before it ran: sent again later
  if (Number(j?.code) !== 200) throw kieBodyError('createTask', j);
  const id = j?.data?.taskId; if (!id) throw new PlaceError('kie.ai answered createTask without a taskId', 'unknown'); return String(id);
}
export async function kieRecord(base: string, id: string, key: string, f: Fetch = fetch): Promise<KieRecord> {
  const j = await readBody('recordInfo', await f(kieRecordUrl(base, id), { headers: H(key) }));
  if (Number(j?.code) !== 200) throw kieBodyError('recordInfo', j); return (j.data ?? {}) as KieRecord;
}
/** resultJson is a JSON string: { resultUrls: [...] }. */
export const kieResultUrls = (r: KieRecord): string[] => { try { const x = typeof r.resultJson === 'string' ? JSON.parse(r.resultJson) : r.resultJson; return (x?.resultUrls ?? []).filter((u: unknown): u is string => typeof u === 'string' && !!u); } catch { return []; } };
export const kieCost = (r: KieRecord): PlaceCost | undefined => (typeof r.creditsConsumed === 'number' && r.creditsConsumed >= 0 ? { usd: Math.round((r.creditsConsumed / KIE_CREDITS_PER_USD) * 1e4) / 1e4, source: 'provider' } : undefined);

/** Upload one file (multipart stream upload); returns its downloadUrl (kept 24 h). */
export async function kieUpload(uploadBase: string, file: string, key: string, f: Fetch = fetch): Promise<string> {
  const fd = new FormData(); fd.append('file', new Blob([new Uint8Array(await fs.readFile(file))], { type: mimeOfFile(file) }), `upload${path.extname(file).toLowerCase()}`);
  fd.append('uploadPath', 'iiayn'); fd.append('fileName', `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}${path.extname(file).toLowerCase()}`);
  const j = await readBody('upload', await f(`${trim(uploadBase)}/api/file-stream-upload`, { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: fd }));
  if (Number(j?.code) !== 200 || !j?.data?.downloadUrl) throw kieBodyError('upload', j?.code ? j : { code: 500, msg: 'no downloadUrl' }); return String(j.data.downloadUrl);
}

/** createTask (or resume) → poll recordInfo until success / fail. Never cancels (kie has no cancel call); a timeout leaves the task id on the job. */
export async function kieRun(base: string, model: string, input: Record<string, unknown>, key: string, o: { timeoutMs: number; pollMs?: number; f?: Fetch; resume?: string | null;
  onSubmit?: (taskId: string) => void; onStatus?: (r: KieRecord) => void; onBusy?: (ms: number) => void; isCanceled?: () => boolean; sleep?: (ms: number) => Promise<void> }) {
  const f = o.f ?? fetch; const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let id = o.resume ?? null;
  if (!id) { id = await withBusyRetry(() => kieCreate(base, model, input, key, f), { busyOf: (e) => (e instanceof BusyError ? e : null), onWait: (ms) => o.onBusy?.(ms), deadline: Date.now() + o.timeoutMs }); o.onSubmit?.(id); }
  const end = Date.now() + o.timeoutMs; const tol = new PollTolerance('kie.ai'); const pollMs = o.pollMs ?? Math.max(2000, HOSTED_POLL_MS()); // docs: start at 2–3 s
  for (;;) {
    if (o.isCanceled?.()) throw new Error('canceled'); // no cancel call at kie: it may still finish (and bill) there
    const r = await tol.read(() => kieRecord(base, id!, key, f));
    if (r !== MISS) { o.onStatus?.(r);
      if (r.state === 'fail') throw new PlaceError(`kie.ai: ${r.failMsg || `the task failed (${r.failCode ?? 'no code'})`}`, kieFailClass(r), { temporary: false, status: Number(r.failCode) || undefined });
      if (r.state === 'success') return { taskId: id, record: r, urls: kieResultUrls(r), cost: kieCost(r) }; }
    if (Date.now() >= end) { const e = new Error('kie.ai timeout'); (e as any).timeout = true; throw e; }
    await sleep(tol.wait(pollMs));
  }
}
