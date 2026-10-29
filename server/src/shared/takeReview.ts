/**
 * The agent reviews its own versions (2026-10-27): every version of a key frame or character sheet gets a calm verdict, ✓ "Fits" or
 * "Check: <short reason>", and the agent recommends one per shot. The user still chooses: a review never changes which version is active.
 * Plain functions (no I/O), shared by the server (canvasReview.ts runs the reviewers) and the board (the badges); the tests check them.
 *
 * Who looks, cheapest first and never a paid call:
 *  - 'agent'   an MCP agent with vision looks at each version itself (get_asset include_image) and records its verdict with canvas_review;
 *  - 'checks'  free simple checks on this computer (ffmpeg): blank or near-black frames, near-duplicates of another version, the wrong
 *              shape, too small. They can't tell a face, so they never claim to;
 *  - 'sample'  the mock sandbox: deterministic sample reviews from fixtures (labelled as samples on the badge).
 * A paid vision model could plug in later as one more reviewer, but only through a quote and Go like any run.
 */
export type ReviewBy = 'agent' | 'checks' | 'sample';
export interface TakeReview { verdict: 'fits' | 'check'; reason: string; by: ReviewBy; rec?: boolean }
export interface PixelStats { mean: number; std: number; hash: string; width?: number | null; height?: number | null }

/** The words on a badge's tooltip. */
export function badgeText(r: TakeReview): string {
  const head = r.verdict === 'fits' ? 'Fits' : `Check: ${r.reason}`;
  const tail = r.by === 'sample' ? ' · sample review' : r.by === 'checks' ? ' · quick checks on your computer' : '';
  return `${head}${r.verdict === 'fits' && r.reason ? `. ${cap(r.reason)}` : ''}${tail}`;
}
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const ratioOf = (aspect?: string | null) => { const m = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(String(aspect ?? '')); return m ? Number(m[1]) / Number(m[2]) : null; };
export const hamming = (a: string, b: string) => { let d = 0; for (let i = 0; i < Math.min(a.length, b.length); i++) { const x = parseInt(a[i], 16) ^ parseInt(b[i], 16); d += (x & 1) + ((x >> 1) & 1) + ((x >> 2) & 1) + ((x >> 3) & 1); } return d + Math.abs(a.length - b.length) * 4; };

/** The free simple checks for one version: blank, dark, a near-copy of an earlier version, the wrong shape, too small. */
export function judgeStats(s: PixelStats, ctx: { earlier: string[]; aspect?: string | null; minSide?: number }): TakeReview {
  const by: ReviewBy = 'checks';
  if (s.std < 4) return { verdict: 'check', reason: 'it looks blank', by };
  if (s.mean < 18) return { verdict: 'check', reason: 'it is nearly black', by };
  if (ctx.earlier.some((h) => hamming(h, s.hash) <= 3)) return { verdict: 'check', reason: 'it is a near-copy of another version', by };
  const want = ratioOf(ctx.aspect); const got = s.width && s.height ? s.width / s.height : null;
  if (want && got && Math.abs(got / want - 1) > 0.08) return { verdict: 'check', reason: `it isn't ${ctx.aspect}`, by };
  if (s.width && s.height && Math.min(s.width, s.height) < (ctx.minSide ?? 512)) return { verdict: 'check', reason: 'it is small; Upscale it before filming', by };
  return { verdict: 'fits', reason: 'sharp, well lit and the right shape', by };
}

/** Deterministic sample reviews for the mock sandbox (fixtures, cycled by shot and version). */
export const SAMPLE_REVIEWS: Omit<TakeReview, 'by'>[] = [
  { verdict: 'fits', reason: 'the face matches the character sheet and the light fits the beat' },
  { verdict: 'check', reason: 'the face drifts from the character sheet' },
  { verdict: 'fits', reason: 'right place and mood, and the action reads clearly' },
  { verdict: 'check', reason: 'daylight, but the beat happens at night' },
  { verdict: 'fits', reason: 'the character matches and the framing leaves room to move' },
  { verdict: 'check', reason: 'an extra hand near the edge of the frame' },
];
export const sampleReview = (shot: number, version: number): TakeReview => ({ ...SAMPLE_REVIEWS[(shot * 2 + version) % SAMPLE_REVIEWS.length], by: 'sample' });

/** The version to recommend (1-based) and the agent's line for one shot. The first version that fits wins (the earliest, so a later
 *  re-roll doesn't move the pick unless it is the only one that fits). Null pick when none fits. */
export function recommend(name: string, reviews: (TakeReview | null | undefined)[]): { pick: number | null; line: string } {
  const n = reviews.length; const i = reviews.findIndex((r) => r?.verdict === 'fits');
  if (!n) return { pick: null, line: `${name}: no versions yet.` };
  if (i < 0) { const why = reviews.find((r) => r?.reason)?.reason ?? 'it needs a look'; return { pick: null, line: `${name}: ${n === 1 ? 'v1 needs a look' : 'none of the versions fits yet'} (${why}). Recreate makes another.` }; }
  const r = reviews[i]!; return { pick: i + 1, line: n === 1 ? `${name}: v1 fits (${r.reason}).` : `${name}: I'd pick v${i + 1}: ${r.reason}.` };
}

/** A card's versions with reviews written in. Only the badges and the recommendation dot change: the active version (`take`) is not
 *  touched, so the user's pick always wins. Versions without a new review keep theirs; a new recommendation moves the dot. */
export function withReviews<T extends { review?: TakeReview }>(takes: T[], reviews: { version: number; verdict: 'fits' | 'check'; reason?: string }[], recommendV: number | null | undefined, by: ReviewBy): T[] {
  return takes.map((t, i) => { const r = reviews.find((x) => x.version === i + 1); const rec = recommendV !== undefined ? recommendV === i + 1 : !!t.review?.rec;
    return r ? { ...t, review: { verdict: r.verdict, reason: String(r.reason ?? '').slice(0, 160), by, rec } } : t.review ? { ...t, review: { ...t.review, rec } } : t; });
}
