/**
 * The Comfy Router runner: a keyed `comfy-router:<id>` route (routing/routerModels.ts) runs on Comfy Router for real (any backend), billed
 * to the user's Comfy account. Per output: build the model's native body → price it (estimate; refuse before dispatch when Comfy now
 * prices it above the accepted quote) → queue it (submit → poll with Retry-After → collect) or, for raw-bytes models, the synchronous
 * route → store the files under DATA_DIR. The Router request id is stored at once (job.routerRequest, attempt.requestId) and only ever
 * polled, never resubmitted. Actual cost: X-Comfy-Credits-Used summed into job.actualCost (billing.ts → the spend log).
 * Failures throw one plain sentence; routing/run.ts refunds the attempt, job.reasonCode says why (comfyRouter.ts RouterReason).
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Job } from '../jobs.js';
import type { RouteAttempt, RouteDef } from './types.js';
import { DATA_DIR } from '../config.js';
import { probe } from '../media.js';
import { runFfmpeg } from '../ffmpeg.js';
import { keyValue } from './keys.js';
import { ComfyRouter, RouterError, ROUTER_MESSAGES, routerBase, providerSaid, estimateHigh, sanitizeProviderText, type RouterEstimate } from '../comfyRouter.js';
import { policyRefusalCharge, refusalReason } from '../shared/policyBilling.js';
import { markRouteOff, clearRouteOff } from './routeOff.js';
import { COMFY_CREDITS_PER_USD } from '../shared/hostedPrices.js';
import { refundAttempt, creditsBackNote } from '../ledger.js';
import { stillBusyMessage, busyReason } from '../busyRetry.js';
import { writeLayerPoster } from '../layerPoster.js';
import { setStorageFetch } from '../comfy/storage.js';
import { routerModelOfRoute, routerCalls, ROUTER_RUNNER_ROUTES, type RouterOut } from './routerModels.js';
import { refInputFor } from './jobRefs.js';
import { routeRequest } from './routeRequest.js';

/** Image to layers: a layer cropped to its box ([left, top, right, bottom] px on the base) → the same layer on a transparent canvas the base's size, in place.
 *  Best effort: if ffmpeg can't, the cropped layer stays (still a valid PNG). */
export async function layerToCanvas(file: string, box: number[], W: number, H: number): Promise<boolean> {
  const [l, t, r, b] = box.map((v) => Math.round(Number(v) || 0)); const x = Math.max(0, Math.min(W - 1, l)), y = Math.max(0, Math.min(H - 1, t));
  const w = Math.max(1, Math.min(W - x, r - l)), h = Math.max(1, Math.min(H - y, b - t)); if (x === 0 && y === 0 && w === W && h === H) return true;
  const tmp = `${file}.canvas.png`;
  const code = await runFfmpeg(['-v', 'error', '-y', '-i', file, '-vf', `scale=${w}:${h},format=rgba,pad=${W}:${H}:${x}:${y}:color=0x00000000`, '-frames:v', '1', tmp]);
  if (code !== 0) { await fs.rm(tmp, { force: true }); return false; } await fs.rename(tmp, file); return true;
}
/** A keyed Router route runs for real on any backend (never a charged mock render). */
export const routerLive = (r: Pick<RouteDef, 'routeId' | 'envKey' | 'envAliases' | 'routerOff'>) => ROUTER_RUNNER_ROUTES.has(r.routeId) && !r.routerOff && !!keyValue(r);
/** Tests: inject fetch / sleep (no network, no waiting). */
let testFetch: typeof fetch | null = null; let testSleep: ((ms: number) => Promise<void>) | null = null;
export const setRouterFetch = (f: typeof fetch | null, sleep: ((ms: number) => Promise<void>) | null = null) => { testFetch = f; testSleep = sleep; setStorageFetch(f, sleep); };
/** Router 422 = validation before the provider call, not billed (docs.comfy.org/development/comfy-router/errors#validation-errors). */
export const NOT_BILLED_NOTE = 'Comfy checked it before running it, so nothing was charged.';
/** invalid_input after the request was sent (a failed COMPLETED): the docs don't say whether it is billed. */
export const UNCONFIRMED_NOTE = 'Comfy doesn’t say whether a run the model rejects is billed, so the estimate stays as a possible, unconfirmed charge.';
/** Price-first, hard rule: the charge never exceeds the quote. An estimate above the per-output quote by more than this rounding margin ($)
 *  stops the run before anything is dispatched. */
export const OVER_QUOTE_MARGIN_USD = 0.002;
/** Token-billed models (the bill follows the tokens the model really uses). Without an exact / estimated Router figure such a model runs only
 *  when its quote already carries a safety allowance for the tokens it can't know ahead (QUOTE_HAS_ALLOWANCE). */
export const TOKEN_BILLED = new Set(['api-gpt-image', 'api-gpt-image-25-flare', 'api-gpt-image-25-sunburst', 'api-nano-banana', 'api-nano-banana-21', 'api-nano-banana-pro',
  'api-gpt-image-15', 'direct-gemini-nb2-lite' /* 2026-10-25: GPT Image 1.5; Nano Banana 2 Lite's Comfy Router place */]);
/** Token-billed models whose quote includes the allowance: Nano Banana (thinking + prompt tokens, hostedPrices.ts NB_THINK_TOKENS / NB_PROMPT_TOKENS)
 *  and GPT Image (gptImageQuote: max(base × 1.2, base + 1 credit), prompt counted). A new token-billed model is refused without an estimate until listed here. */
export const QUOTE_HAS_ALLOWANCE = new Set(['api-nano-banana', 'api-nano-banana-21', 'api-nano-banana-pro', 'api-gpt-image', 'api-gpt-image-25-flare', 'api-gpt-image-25-sunburst',
  'api-gpt-image-15' /* gptImageQuote */, 'direct-gemini-nb2-lite' /* nbRow allowance on its Router row */]);
export const NO_ESTIMATE_MESSAGE = (name: string) => `Comfy couldn't price this ${name} run ahead, and its token bill can go above our quote, so it didn't start. Nothing was charged. Try again later or pick another model.`;
const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm', 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/ogg': 'ogg' };
const extOf = (mime: string | undefined, url: string | undefined, out: string) => EXT[String(mime ?? '').toLowerCase()] ?? url?.split('?')[0].match(/\.(png|jpe?g|webp|mp4|mov|webm|mp3|wav|ogg)$/i)?.[1]?.toLowerCase() ?? (out === 'video' ? 'mp4' : out === 'audio' ? 'mp3' : 'png');

async function save(job: Job, k: number, o: RouterOut | { bytes: Buffer; mime: string }, out: string, f: typeof fetch): Promise<string> {
  let buf: Buffer; let mime = 'mime' in o ? o.mime : undefined;
  if ('bytes' in o) buf = o.bytes;
  else if (o.b64) buf = Buffer.from(o.b64.replace(/^data:[^,]*,/, ''), 'base64');
  else if (o.url?.startsWith('data:')) { mime = o.url.slice(5).split(/[;,]/)[0]; buf = Buffer.from(o.url.split(',')[1] ?? '', 'base64'); }
  else { // result assets are signed links (Comfy storage or the provider's): fetched WITHOUT the key
    let r: Response; try { r = await f(o.url!); } catch (e) { throw new RouterError('provider_error', 'the result could not be downloaded.', null, null, true, String(e)); }
    if (!r.ok) throw new RouterError('provider_error', 'the result could not be downloaded (the link may have expired).', r.status, null, true, `download → ${r.status}`);
    mime = (r.headers.get('content-type') ?? '').split(';')[0].trim() || mime; buf = Buffer.from(await r.arrayBuffer());
  }
  if (!buf.length) throw new RouterError('provider_error', 'the result came back empty.', null, null, true, 'empty output');
  const name = `${job.id}-out${k}.${extOf(mime, 'url' in o ? o.url : undefined, out)}`; await fs.writeFile(path.join(DATA_DIR, name), buf); return `/files/${name}`;
}

export async function runRouter(job: Job, r: RouteDef, attempt: RouteAttempt, timeoutMs: number) {
  const spec = routerModelOfRoute(r.routeId); if (!spec) throw new Error(`${r.routeId} has no Comfy Router model`);
  const f = testFetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const c = new ComfyRouter(keyValue(r)!, f, routerBase(), testSleep ?? undefined);
  c.onBusy = (ms) => { job.queueReason = busyReason('Comfy Router', ms); job.updatedAt = Date.now(); }; // provider busy (busyRetry.ts): the card says why it waits
  const i = refInputFor(job, r); /* prompt grammar: the model's own reference syntax (routing/jobRefs.ts) */ const n = routerCalls(spec, i); const rid = spec.idFor?.(i) ?? spec.id; // FIBO 2.0: bria/image or bria/fibo
  const quotedJob = (job.routing?.prices?.[r.routeId] ?? job.cost ?? 0) / 100; // USD the user accepted for the job (1 credit = $0.01)
  const quotedAt = (k: number) => quotedJob * (spec.callShare ? spec.callShare(i, k) : 1 / n); // per request (cloud swaps: each pass its own share)
  const labels = Array.isArray(i.shots) && i.shots.length ? i.shots.map((x: any) => String(x.label)) : n > 1 ? Array.from({ length: n }, (_, k) => `${spec.finish ? 'Part' : 'Image'} ${k + 1}`) : [String(i.outputLabel ?? 'Result')];
  let credits = 0; let reported = false; let billed = 0; let dispatched = 0; const outs: { label: string; url: string; box?: number[]; description?: string }[] = []; const estimates: RouterEstimate[] = []; const usage: { output: number; usage: unknown }[] = [];
  try {
    const block = spec.block?.(i); if (block) throw new RouterError('input_invalid', `${block}.`, null, null, false, 'blocked before submit');
    for (let k = 0; k < n; k++) {
      job.stage = 'submitted'; const { body } = await routeRequest(job, r, k); // routing/routeRequest.ts: the same rewrite (refInputFor), then spec.body
      const est = await c.estimate(rid, body).catch((e) => { if (e instanceof RouterError && !e.temporary) throw e; return null; }); // a key / credits / plan / body problem fails here, before anything runs
      if (est) estimates.push(est); // null = 403 not_enabled / 503: no estimate (never a failure by itself)
      const hi = estimateHigh(est); // free = $0, a known price (2026-10-31)
      const quoted = quotedAt(k);
      if (hi != null && quoted > 0 && hi > quoted + OVER_QUOTE_MARGIN_USD) throw new RouterError('price_changed', `${ROUTER_MESSAGES.price_changed.replace(/\.$/, '')} ($${hi.toFixed(4)} now, $${quoted.toFixed(4)} quoted).`, null, null, false, `estimate ${JSON.stringify(est)}`);
      if (hi == null && TOKEN_BILLED.has(spec.provider) && !QUOTE_HAS_ALLOWANCE.has(spec.provider)) throw new RouterError('price_changed', NO_ESTIMATE_MESSAGE((spec as any).name ?? spec.id), null, null, false, `no usable estimate (${est ? est.source : 'none'}) for a token-billed model without a quote allowance`);
      const idem = `${job.id}-a${attempt.n}-o${k}`;
      const noteId = (id: string | null, cancelUrl?: string) => { if (!id) return; dispatched++; attempt.requestId = id; (job.requestIds ??= []).push(id); (job as any).routerRequest = { id, model: rid, ...(cancelUrl ? { cancelUrl } : {}) }; };
      const res = spec.queue
        ? await c.runQueued(rid, body, idem, { timeoutMs, isCanceled: () => (job.status as string) === 'canceled', onSubmitted: (h) => noteId(h.requestId, h.cancelUrl),
            onStatus: (s, q) => { job.stage = s === 'IN_QUEUE' ? 'submitted' : 'rendering'; if (q != null) job.queuePos = q; } })
        : await (async () => { job.stage = 'rendering'; const x = await c.run(rid, body, idem, timeoutMs); noteId(x.requestId); return x; })();
      job.queueReason = null; billed++; // Comfy ran this request: it is billed whatever happens next
      if (res.creditsUsed != null) { credits += res.creditsUsed; reported = true; }
      { const j: any = res.json; const u = j?.usage ?? j?.usageMetadata ?? j?.response?.usageMetadata ?? j?.data?.usage; if (u && typeof u === 'object') usage.push({ output: k, usage: u }); } // token counts, kept to calibrate prices
      job.stage = 'downloading';
      if (res.bytes && res.contentType && !/json/.test(res.contentType)) { outs.push({ label: labels[k], url: await save(job, k, { bytes: res.bytes, mime: res.contentType }, spec.out, f) }); continue; }
      const got = spec.outputs(res.json);
      if (!Array.isArray(got)) { const e = new RouterError('content_blocked', ROUTER_MESSAGES.content_blocked, 200, 'content_policy_violation', false, `refused in the result: ${got.refused.slice(0, 200)}`, res.requestId);
        e.provider = { errorType: 'content_policy_violation', httpStatus: 200, upstreamStatus: null, detail: sanitizeProviderText(got.refused), upstreamDetail: null, refusalSubject: null, requestId: res.requestId }; throw e; } // the provider's own words (BytePlus error.code), kept
      if (!got.length) throw new RouterError('provider_error', 'the model returned no result.', 200, null, true, `no output in ${JSON.stringify(res.json).slice(0, 300)}`);
      if (spec.allOutputs) { // Image to layers: every file of the one call; a layer with a box goes onto a transparent canvas the base's size (full-canvas layers stack as they are)
        const first = outs.length; for (let m = 0; m < got.length; m++) { const g: any = got[m]; outs.push({ label: String(g.label ?? `${labels[k]} ${m + 1}`), url: await save(job, outs.length, g, spec.out, f), ...(Array.isArray(g.box) ? { box: g.box } : {}), ...(g.description ? { description: String(g.description) } : {}) }); }
        const base = await probe(path.join(DATA_DIR, path.basename(outs[first].url)));
        if (base?.width && base?.height) for (let m = 1; m < got.length; m++) { const box = (got[m] as any).box; if (Array.isArray(box)) await layerToCanvas(path.join(DATA_DIR, path.basename(outs[first + m].url)), box, base.width, base.height); }
        continue; }
      outs.push({ label: labels[k], url: await save(job, k, got[0], spec.out, f) });
    }
  } catch (e) {
    if ((job.status as string) === 'canceled') return;
    if (usage.length) (job as any).routerUsage = usage;
    // n > 1 failing partway: the images Comfy already made (and billed) are kept and charged; only the rest goes back.
    if (n > 1 && outs.length > 0 && billed > 0 && !spec.finish /* passes of one clip: a part is no result */) { keepPartial(job, r, attempt, n, billed, outs, e);
      if (reported) job.actualCost = { usd: Math.round((credits / COMFY_CREDITS_PER_USD) * 1e4) / 1e4, units: credits, unitLabel: 'Comfy credits', source: 'comfy-router:credits-used' };
      if (estimates.length) (job as any).routerEstimates = estimates; return; }
    if (reported) job.actualCost = { usd: Math.round((credits / COMFY_CREDITS_PER_USD) * 1e4) / 1e4, units: credits, unitLabel: 'Comfy credits', source: 'comfy-router:credits-used' };
    if (!(e instanceof RouterError)) throw e;
    if (e.reasonCode === 'canceled') { job.status = 'canceled'; return; }
    job.errorType = e.temporary ? 'temporary' : e.reasonCode === 'content_blocked' ? 'nsfw' : e.reasonCode === 'cloud_credits' ? 'credits' : 'provider_outage'; job.reasonCode = e.reasonCode;
    if (estimates.length) (job as any).routerEstimates = estimates;
    let note = '';
    // not_enabled (2026-10-27): Router doesn't run this model for this caller yet. Refused before any run: nothing billed, and the route is skipped
    // by the automatic pick for 24 h (routing/routeOff.ts), so the same model's Comfy Cloud route runs instead
    if (e.reasonCode === 'route_not_enabled') { markRouteOff(r.routeId, job.modelKey ?? null); (job as any).chargeNote = 'not_charged';
      const name = String(job.modelName ?? (spec as any).name ?? 'this model'); job.queueReason = null;
      throw new Error(`Comfy Router doesn't run ${name} yet`); }
    if (e.reasonCode === 'input_invalid' && e.detail !== 'blocked before submit') {
      if (e.httpStatus === 422 && billed === 0 && dispatched === 0) { (job as any).chargeNote = 'not_charged'; note = ` ${NOT_BILLED_NOTE}`; }
      else if (dispatched > billed) { (job as any).chargeNote = 'unconfirmed'; note = ` ${UNCONFIRMED_NOTE}`; }
    }
    // what Comfy / the provider said, sanitised (comfyRouter.ts sanitizeProviderText). A failure with no words (a queued COMPLETED with only its error bucket,
    // 2026-10-31: two Seedance refusals kept nothing) still keeps its bucket and request id, so the job says what happened and where to look it up
    if (e.provider || e.detail !== 'blocked before submit') (job as any).providerError = { ...(e.provider ?? { errorType: e.errorType, httpStatus: e.httpStatus, upstreamStatus: null, detail: null, upstreamDetail: null, refusalSubject: null, requestId: e.requestId ?? attempt.requestId ?? null }), model: rid, at: Date.now() };
    // a content refusal on a model whose Router catalog says policy refusals are not billed (shared/policyBilling.ts), with no reported charge: nothing to count
    if (e.reasonCode === 'content_blocked' && !reported && policyRefusalCharge(job as any) === 'no') (job as any).chargeNote = 'not_charged';
    console.error(`[openhiggsfield] comfy router ${job.id}: ${e.reasonCode}${e.httpStatus ? ` (${e.httpStatus})` : ''}${e.errorType ? ` ${e.errorType}` : ''}${e.requestId ? ` request ${e.requestId}` : ''} ${e.detail ?? ''}${e.provider ? ` | provider said: ${JSON.stringify(e.provider)}` : ''}`);
    job.queueReason = null;
    // provider_error: the provider's own words go on the card (the bare bucket says nothing); input_invalid already quotes the detail
    const said = e.reasonCode === 'provider_error' ? providerSaid(e.provider) : null;
    const why = e.reasonCode === 'content_blocked' ? refusalReason((job as any).providerError) : null; // "The provider refused a photo of a real person."
    const msg = said ? `${e.message.replace(/\.$/, '')}. Comfy said: ${said.replace(/\.$/, '')}` : why ? `${why.charAt(0).toLowerCase()}${why.slice(1).replace(/\.$/, '')} (content policy)` : e.message.replace(/\.$/, '');
    const err = new Error((e as any).busy ? stillBusyMessage((e as any).busyTries ?? 1) : note ? `${msg}.${note.replace(/\.$/, '')}` : msg); if (e.reasonCode === 'cloud_timeout') (err as any).timeout = true; throw err;
  }
  clearRouteOff(r.routeId); // it ran: a not_enabled mark from before is over
  if (reported) job.actualCost = { usd: Math.round((credits / COMFY_CREDITS_PER_USD) * 1e4) / 1e4, units: credits, unitLabel: 'Comfy credits', source: 'comfy-router:credits-used' };
  if (estimates.length) (job as any).routerEstimates = estimates;
  if (usage.length) (job as any).routerUsage = usage;
  if (spec.finish) { job.stage = 'muxing'; try { outs.splice(0, outs.length, ...(await spec.finish(job, outs))); } // cloud swaps: join the passes, put the clip's sound back
    catch (e) { job.errorType = 'temporary'; throw new Error(`The swap was made but ${e instanceof Error ? e.message.replace(/\.$/, '') : String(e)}. Try again`); } }
  if (spec.allOutputs) { job.outputs = outs; await writeLayerPoster(job); } // Image to layers: the composite, once, as the card's poster
  job.outputs = outs; job.resultUrl = outs[0]?.url ?? null; job.status = 'done'; job.stage = 'done'; job.progress = 100; job.eta = 0;
}

/** A multi-image run that failed after `billed` of its `n` requests ran: the job ends done with the images it has; the credits for the
 *  requests that never ran go back (per-request credits × (n − billed), the quote's own per-image figure). */
function keepPartial(job: Job, r: RouteDef, attempt: RouteAttempt, n: number, billed: number, outs: { label: string; url: string }[], e: unknown) {
  const price = job.routing?.prices?.[r.routeId] ?? job.cost ?? 0; const per = Math.floor(price / n); const back = per * (n - billed);
  const why = e instanceof Error ? e.message.replace(/\.$/, '') : String(e);
  const amt = back > 0 ? refundAttempt(job.id, attempt.n, back, creditsBackNote(`${n - billed} of ${n} images not made`, true)) : 0;
  attempt.refunded = (attempt.refunded ?? 0) + amt; job.cost = Math.max(0, price - amt);
  job.warnings = [...(job.warnings ?? []), `${outs.length} of ${n} images were made; the rest failed (${why}).${amt > 0 ? ` ✦${amt} for the ${n - billed} not made went back to your balance.` : ''}`];
  (job as any).partial = { made: outs.length, asked: n, billed, refunded: amt };
  console.error(`[openhiggsfield] comfy router ${job.id}: partial ${outs.length}/${n} (billed ${billed}): ${e instanceof RouterError ? e.reasonCode : ''} ${why}`);
  job.outputs = outs; job.resultUrl = outs[0]?.url ?? null; job.status = 'done'; job.stage = 'done'; job.progress = 100; job.eta = 0;
}
