/** Batch 28: will a local route run on this computer? The server's `fit` (routes, models, quotes, jobs) turned into short labels.
 *  The server's own sentence (reason / warning) is always shown word for word; the client only adds the short tag. */
export type FitEta = { source?: 'learned' | 'estimate' | string; samples?: number; estimateSeconds?: number | null; learnedSeconds?: number | null };
/** B31 (pb/hw2): the tool's best cloud/hosted route that really runs; demo:true = a sample run (credits 0, listCredits = its usual price). */
export type FitAlt = { providerId: string; routeId?: string | null; name?: string; routeLabel?: string | null; credits?: number | null; priceLine?: string | null; tier?: number | null; tierLabel?: string | null; demo?: boolean; listCredits?: number | null };
export type AltReason = 'slow' | 'too_heavy' | 'unknown' | 'weights_missing' | null;
export type Fit = { verdict: 'fits' | 'slow' | 'too_heavy' | 'unknown' | string; reasonCode?: string; hardwareReasonCode?: string; reason?: string | null; tier?: string;
  recommendedVramGB?: number | null; effectiveVramGB?: number | null; lighterVariantAvailable?: boolean; etaSeconds?: number | null; eta?: FitEta | null;
  alternative?: FitAlt | null; alternativeReason?: AltReason | string; warning?: string | null; missingBytes?: number | null; missingBytesSource?: 'checked' | 'assumed_all' | string | null; diskFreeBytes?: number | null; pinnedAnyway?: boolean; downloadId?: string | null };
export type FitKind = 'fits' | 'slow' | 'heavy' | 'disk' | 'unknown';
export const LOCAL_SETUP_HREF = '/settings#gpu';

export const isFit = (x: any): x is Fit => !!x && typeof x === 'object' && typeof x.verdict === 'string';
const isLocalRoute = (r: any) => !!r && (r.kind === 'local' || r.runsOnKind === 'local' || /^local:/.test(String(r.routeId ?? '')));
/** The fit of a model's local route: the route's full fit, else the model's short {verdict, reasonCode}. Null when it has no local route. */
export function localFitOf(p: any): Fit | null {
  if (!p) return null; const rs: any[] = Array.isArray(p.routes) ? p.routes : [];
  const r = rs.find(x => isLocalRoute(x) && isFit(x.fit)); if (r) return r.fit;
  return isFit(p.fit) ? p.fit : null;
}
/** A route's own fit (route chips). */
export const routeFitOf = (r: any): Fit | null => (isLocalRoute(r) && isFit(r?.fit) ? r.fit : null);

/** GB with one decimal (1 GB = 10^9 bytes, as the server counts), "0.4 GB", "29.5 GB", "30 GB". */
export const gbText = (bytes: number | null | undefined): string => { const g = (Number(bytes) || 0) / 1e9; const r = g >= 10 ? Math.round(g) : Math.round(g * 10) / 10; return `${r || 0.1} GB`; };
export const minutesOf = (s: number) => Math.max(1, Math.round(s / 60));
export const etaText = (s: number | null | undefined): string | null => (typeof s === 'number' && s > 0 ? (s < 90 ? `about ${Math.max(1, Math.round(s))} s` : `about ${minutesOf(s)} min`) : null);
export const etaSourceNote = (f: Fit): string | null => (f.eta?.source === 'learned' ? `timed from ${f.eta.samples ?? 'your'} past run${f.eta.samples === 1 ? '' : 's'} on this computer` : f.eta?.source === 'estimate' ? 'estimate' : null);

/** The short tag for a fit. */
export function fitLabel(f: Fit | null | undefined): { kind: FitKind; text: string } | null {
  if (!isFit(f)) return null;
  const code = f.reasonCode ?? '';
  if (code === 'not_enough_disk' && f.missingBytesSource !== 'assumed_all' /* B31: an assumed full size is never a disk blocker */) return { kind: 'disk', text: typeof f.missingBytes === 'number' && f.missingBytes > 0 ? `Not enough disk, needs ${gbText(f.missingBytes)} more` : 'Not enough disk' };
  if (f.verdict === 'fits') return { kind: 'fits', text: 'Runs on your computer' };
  if (f.verdict === 'slow') { const m = typeof f.etaSeconds === 'number' && f.etaSeconds > 0 ? minutesOf(f.etaSeconds) : null; return { kind: 'slow', text: m ? `Slow on your computer, about ${m} min` : 'Slow on this computer' }; }
  if (f.verdict === 'too_heavy') return { kind: 'heavy', text: 'Too heavy for your computer' };
  return { kind: 'unknown', text: code === 'requirements_unknown' ? 'Can’t check this model' : 'Can’t check your computer' };
}
/** A lighter version is worth mentioning only when the full one is slow or too heavy. */
export const showLighter = (f: Fit | null | undefined) => !!f && f.lighterVariantAvailable === true && (f.verdict === 'slow' || f.verdict === 'too_heavy');

/** A quote's fit with the quote-level extras folded in: the cloud alternative and the pinned too-heavy warning. */
export const quoteFitOf = (q: any): Fit | null => (isFit(q?.fit) ? { ...q.fit, alternative: q.fit.alternative ?? q.alternative ?? null, alternativeReason: q.fit.alternativeReason ?? q.alternativeReason ?? null, warning: q.fit.warning ?? q.fitWarning ?? q.warning ?? null } : null);
/** B31: the fit note offers the cloud route when the server says why (slow / too heavy) or the disk is short; 'unknown' and
 *  'weights_missing' alternatives go on the download prompt instead, so one place offers it. */
export const noteOffersAlt = (f: Fit | null | undefined): boolean => { const l = fitLabel(f); if (!l || !f?.alternative?.providerId) return false;
  const why = f.alternativeReason; return why === 'slow' || why === 'too_heavy' || l.kind === 'heavy' || l.kind === 'disk'; };

/** B30: the cloud alternative for the download prompt, unless the fit note already offers it (too heavy / not enough disk). */
export const weightsAlt = (q: any): FitAlt | null => {
  const f = quoteFitOf(q); if (noteOffersAlt(f)) return null;
  const a = f?.alternative ?? q?.alternative ?? null; return a && typeof a.providerId === 'string' ? a : null; };
/** B31: the download target the server names (providerId, or '<providerId>:<wf>+<wf>' for a shared open-weights card). */
export const downloadIdOf = (q: any, fallback?: string | null): string | null => String(q?.requirements?.downloadId ?? q?.fit?.downloadId ?? q?.downloadId ?? fallback ?? '') || null;
/** B31: 'Sample' when the alternative is a sample run, so its price reads 0. */
export const altCredits = (a: FitAlt): number | null => (a.demo ? 0 : typeof a.credits === 'number' ? a.credits : null);
