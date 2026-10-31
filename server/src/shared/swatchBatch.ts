/**
 * Several swatches in one go (Material Swap, 2026-10-31): one object photo and 1–6 material swatches make one run per swatch, the same
 * object in the same scene. Pure (no React, no network), shared by Create Image's bar, the Canvas card and the tests.
 *
 * It reuses what the app already has, nothing parallel:
 *  - each swatch is its own job through the normal submit (POST /api/tools/:id/jobs): its own quote = charge, history, cancel and Retry;
 *  - the jobs carry the Compare models fields (compareGroup / compareOf / compareIndex) with compareKind 'swatch', so the feed shows them
 *    as one labelled set (feedLayout.ts, CompareGroupHead) and a Retry lands back in the set (server: the retry keeps the job's set);
 *  - local runs go one after another because the queue's local lane runs one job at a time (queue.ts LOCAL_CONCURRENCY); cloud runs
 *    go at the cloud lane's pace, as every other run does.
 */
export const SWATCH_MAX = 6;
/** The words when there are more swatches than one go takes. */
export const tooManySwatches = (n: number) => (n > SWATCH_MAX ? `Up to ${SWATCH_MAX} swatches in one go: ${n - SWATCH_MAX} not added.` : '');
/** The extra keys a several-file slot keeps its files under in a flat slot → file map: material, material#2 … material#6. */
export const swatchKey = (slot: string, i: number) => (i === 0 ? slot : `${slot}#${i + 1}`);
export const swatchKeys = (slot: string, max = SWATCH_MAX) => Array.from({ length: max }, (_, i) => swatchKey(slot, i));
/** The files of a several-file slot, in order (holes skipped). */
export function swatchesOf<T>(files: Record<string, T | null | undefined>, slot: string, max = SWATCH_MAX): T[] {
  return swatchKeys(slot, max).map((k) => files[k]).filter((x): x is T => !!x);
}
/** The next empty key of a several-file slot, or null when it is full. */
export function nextSwatchKey(files: Record<string, unknown>, slot: string, max = SWATCH_MAX): string | null {
  return swatchKeys(slot, max).find((k) => !files[k]) ?? null;
}
/** The keys after removing one: the rest move up, so the order stays 1, 2, 3… with no holes. */
export function withoutSwatch<T>(files: Record<string, T | null>, slot: string, key: string, max = SWATCH_MAX): Record<string, T | null> {
  const keys = swatchKeys(slot, max); const rest = keys.filter((k) => k !== key).map((k) => files[k] ?? null).filter(Boolean);
  const out = { ...files }; keys.forEach((k, i) => { out[k] = rest[i] ?? null; }); return out;
}

/** The quote for n runs: n × one run's price (credits, dollars, units). Free stays free, a sample stays a sample, no price stays none. */
export function timesQuote<Q>(q: Q, n: number): Q {
  const x: any = q; if (!x || typeof x !== 'object' || n <= 1) return q;
  const mul = (v: unknown) => (typeof v === 'number' ? Math.round(v * n * 1e6) / 1e6 : v);
  return { ...x, credits: mul(x.credits), ...(x.listCredits != null ? { listCredits: mul(x.listCredits) } : {}), runs: n,
    ...(x.cost && typeof x.cost === 'object' ? { cost: { ...x.cost, estUsd: mul(x.cost.estUsd), ...(x.cost.estUnits != null ? { estUnits: mul(x.cost.estUnits) } : {}) } } : {}) };
}
/** Generate's words: "Swap material" for one, "Swap 4 materials" for several. */
export const batchLabel = (one: string, n: number) => (n > 1 ? `Swap ${n} materials` : one);

/** A new set id (the server takes [\w-]{4,40}). */
export const newSetId = () => `sw-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
/** The fields that put job i of n in one set (none for a single run: it is today's plain run). */
export const setFields = (id: string, n: number, i: number): Record<string, string> =>
  n > 1 ? { compareGroup: id, compareOf: String(n), compareIndex: String(i), compareKind: 'swatch' } : {};

export interface BatchRun { jobIds: (string | null)[]; failed: { index: number; error: string }[]; started: number }
/** Submit one run per swatch, in order, through the caller's normal submit. One that is refused doesn't stop the others (it isn't
 *  charged); `stop` ends the loop (a budget stop, a cancel while still submitting). Returns every swatch's job id (null = not started). */
export async function runBatch<T>(swatches: T[], submit: (s: T, set: Record<string, string>, i: number) => Promise<string>, o: { setId?: string; stop?: () => boolean } = {}): Promise<BatchRun> {
  const n = Math.min(swatches.length, SWATCH_MAX); const id = o.setId ?? newSetId(); const out: BatchRun = { jobIds: [], failed: [], started: 0 };
  for (let i = 0; i < n; i++) {
    if (o.stop?.()) { out.jobIds.push(null); out.failed.push({ index: i, error: 'Stopped before it started.' }); continue; }
    try { out.jobIds.push(await submit(swatches[i], setFields(id, n, i), i)); out.started++; }
    catch (e) { out.jobIds.push(null); out.failed.push({ index: i, error: String((e as Error)?.message ?? 'It didn’t start.') }); }
  }
  return out;
}
/** The toast after a batch: all started, some started, or none. */
export function batchToast(r: Pick<BatchRun, 'started' | 'failed'>, n: number): { text: string; tone: 'info' | 'warn' | 'error' } {
  if (!r.failed.length) return { text: n > 1 ? `Swapping ${n} materials. The results land together in your feed.` : 'Started.', tone: 'info' };
  const which = r.failed.map((f) => f.index + 1).join(', ');
  return r.started ? { text: `${r.started} of ${n} started. Swatch ${which} didn’t start, so it wasn’t charged: ${r.failed[0].error}`, tone: 'warn' }
    : { text: `None started, so nothing was charged: ${r.failed[0].error}`, tone: 'error' };
}
/** The state of a set from its jobs: still running, done, or done with some failed. */
export function setState(statuses: (string | undefined)[]): { done: boolean; ok: number; failed: number; running: number } {
  const T = new Set(['done', 'failed', 'blocked', 'canceled']); const ok = statuses.filter((s) => s === 'done').length;
  const failed = statuses.filter((s) => s === 'failed' || s === 'blocked' || s === 'canceled').length; const running = statuses.filter((s) => !s || !T.has(s)).length;
  return { done: running === 0, ok, failed, running };
}
