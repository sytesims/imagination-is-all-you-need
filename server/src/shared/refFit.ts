/**
 * What a video model does with the references you added (2026-10-31, the reference-aware model picker): ONE helper for the model menu's
 * two sections ("Works with your files" · "Skips some of your files") and per-row notes, Auto's pick and the bar's "Not used" marks, so the three always agree with what Generate sends.
 *  - In: the model's caps (its modes, refKinds / refMax from the tool's videoLimits) and what's on the bar (start frame, pictures, videos, sounds).
 *  - The rule is the server's: pictures, videos and sounds are references, used in Reference mode (r2v) only, up to the model's refMax;
 *    in Reference mode the start frame is picture 1 (counted with the pictures). Without Reference mode the start frame is used when the model makes image to video.
 *  - The mode a model would run: the page's mode when it makes it; else Reference when you added references and it can, else image to
 *    video when there's a start frame, else its first mode. Picking a model switches to that mode (VideoStudio onPick),
 *    and the picker quotes each row in it (routing/quotesBatch.ts rowRefParams).
 */
export type RefKind = 'start' | 'image' | 'video' | 'audio';
/** What's on the bar. */
export interface RefsAdded { start: boolean; image: number; video: number; audio: number }
/** A model's caps (videoLimits refKinds / refMax, the tool's providerModes). */
export interface RefCapsOf { modes?: string[] | null; refKinds?: string[] | null; refMax?: Record<string, number> | null }
export interface RefPart { kind: RefKind; have: number; used: number }
export interface RefFit {
  /** the mode it would run */ mode: string;
  /** one part per kind you added (start, pictures, videos, sounds) */ parts: RefPart[];
  /** works with all your files (uses every one) */ all: boolean; usedN: number; haveN: number;
  /** the start frame (or, in Reference mode, picture 1) is used */ startUsed: boolean;
  /** how many of each bar list it sends (refs, refVideos, refAudios): the submit's caps */ caps: { refs: number; refVideos: number; refAudios: number };
}

const START_MODES = ['i2v', 'r2v', 'flf'];
export const refsAddedN = (a: RefsAdded) => (a.start ? 1 : 0) + a.image + a.video + a.audio;
const hasRefList = (a: RefsAdded) => a.image + a.video + a.audio > 0;

export function runModeOf(c: RefCapsOf, cur: string, a: RefsAdded): string {
  const ms = c.modes?.length ? c.modes : [cur];
  if (ms.includes(cur) && !(hasRefList(a) && cur !== 'r2v' && ms.includes('r2v'))) return cur;
  if (hasRefList(a) && ms.includes('r2v')) return 'r2v';
  if (a.start && ms.includes('i2v')) return 'i2v';
  return ms.includes(cur) ? cur : ms[0];
}

/** What model `c` would use of `a`. `mode`: the page's mode now (the bar passes it as is; the menu lets each model pick its run mode). */
export function refFitOf(c: RefCapsOf, a: RefsAdded, cur: string, o: { keepMode?: boolean } = {}): RefFit {
  const mode = o.keepMode ? cur : runModeOf(c, cur, a);
  const kinds = c.refKinds ?? ['image']; const max = c.refMax ?? { image: 1 };
  const refMode = mode === 'r2v';
  const imgCap = refMode && kinds.includes('image') ? max.image ?? 0 : 0;
  const startIsRef = refMode && a.start; /* Reference mode: the start picture is picture 1, so it counts as a picture */
  const startUsed = a.start && (refMode ? imgCap >= 1 : START_MODES.includes(mode));
  const caps = { refs: Math.max(0, imgCap - (startIsRef ? 1 : 0)), refVideos: refMode && kinds.includes('video') ? max.video ?? 0 : 0, refAudios: refMode && kinds.includes('audio') ? max.audio ?? 0 : 0 };
  const parts: RefPart[] = [];
  if (a.start && !startIsRef) parts.push({ kind: 'start', have: 1, used: startUsed ? 1 : 0 });
  const pics = a.image + (startIsRef ? 1 : 0);
  if (pics) parts.push({ kind: 'image', have: pics, used: Math.min(pics, imgCap) });
  if (a.video) parts.push({ kind: 'video', have: a.video, used: Math.min(a.video, caps.refVideos) });
  if (a.audio) parts.push({ kind: 'audio', have: a.audio, used: Math.min(a.audio, caps.refAudios) });
  const usedN = parts.reduce((n, p) => n + p.used, 0); const haveN = parts.reduce((n, p) => n + p.have, 0);
  return { mode, parts, all: usedN === haveN, usedN, haveN, caps, startUsed };
}

/** The picture a mode needs is there: the start frame, or in Reference mode the first picture reference it sends (the server makes it
 *  picture 1: files.image ?? files.refs[0]). `refsSent` = the picture references the run sends (the bar's list, capped by the model). */
export const hasPicture = (mode: string, start: boolean, refsSent: number) => start || (mode === 'r2v' && refsSent > 0);

const NOUN: Record<Exclude<RefKind, 'start'>, [string, string]> = { image: ['picture', 'pictures'], video: ['video', 'videos'], audio: ['sound', 'sounds'] };
/** One part in a few calm words: "Start frame", "No start frame", "Uses your video", "Skips your video", "Uses 2 of your 3 pictures". */
export function partText(p: RefPart): string {
  if (p.kind === 'start') return p.used ? 'Start frame' : 'No start frame';
  const [one, many] = NOUN[p.kind]; const noun = p.have === 1 ? one : many; const your = p.have === 1 ? `your ${noun}` : `your ${p.have} ${noun}`;
  if (p.used === p.have) return `Uses ${your}`;
  if (!p.used) return `Skips ${your}`;
  return `Uses ${p.used} of your ${p.have} ${noun}`;
}
/** The parts a model skips (all or some), in words: "your video, 1 picture". */
export function skippedText(f: RefFit): string {
  return f.parts.filter(p => p.used < p.have).map(p => { if (p.kind === 'start') return 'the start frame'; const n = p.have - p.used; const [one, many] = NOUN[p.kind];
    return p.used === 0 ? (p.have === 1 ? `your ${one}` : `your ${p.have} ${many}`) : `${n} ${n === 1 ? one : many}`; }).join(', ');
}
/** The bar's short line beside the thumbs: "Video not used", "2 pictures not used", "Start frame not used", "2 not used". */
export function notUsedShort(f: RefFit): string {
  const sk = f.parts.filter(p => p.used < p.have); const n = sk.reduce((a, p) => a + p.have - p.used, 0);
  if (sk.length !== 1) return `${n} not used`; const p = sk[0]; if (p.kind === 'start') return 'Start frame not used';
  const k = p.have - p.used; const [one, many] = NOUN[p.kind]; return `${k === 1 ? one[0].toUpperCase() + one.slice(1) : `${k} ${many}`} not used`;
}
/** The bar's one-line verdict for a thumb's tooltip and the note beside the thumbs. */
export const notUsedBy = (name: string) => `Not used by ${name || 'this model'}`;

/**
 * Auto with references: the usual pick when it works with all your files; else the first model in the menu's own order (featured, then
 * rank) that does; else the one that uses the most (ties: menu order). Models that can't run here are passed in already left out.
 */
export function bestRefPick<T>(list: T[], fitOf: (t: T) => RefFit | null, usual: T | null): T | null {
  if (usual && fitOf(usual)?.all) return usual;
  const full = list.find(t => fitOf(t)?.all); if (full) return full;
  let best: T | null = usual; let n = usual ? fitOf(usual)?.usedN ?? -1 : -1;
  for (const t of list) { const u = fitOf(t)?.usedN ?? -1; if (u > n) { best = t; n = u; } }
  return best;
}
export const AUTO_REF_RULE = 'Auto picks the usual model when it works with all your files; otherwise the first model in this list that does; otherwise the one that uses the most of them.';

/* ---------------- quotes (the page's /price and the picker's batch, POST /api/models/quotes) ----------------
 * A quote judges the job with what's on the bar, so a row never says "Needs a start image" while one is attached: image=1 for a start
 * frame (an upload or a hand-off from Image: both sit in the same slot), and the bar's raw counts refImages / refVideos / refAudios. */
const cnt = (v: unknown) => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n > 0 ? n : 0; };
/** The params a quote needs for what's on the bar (only the ones that are set). */
export function attachParams(a: RefsAdded): Record<string, string> {
  return { ...(a.start ? { image: '1' } : {}), ...(a.image ? { refImages: String(a.image) } : {}), ...(a.video ? { refVideos: String(a.video) } : {}), ...(a.audio ? { refAudios: String(a.audio) } : {}) };
}
/** What's on the bar, read back from quote params. */
export const attachedOf = (q: Record<string, unknown>): RefsAdded => ({ start: q.image === '1' || q.image === 'true', image: cnt(q.refImages), video: cnt(q.refVideos), audio: cnt(q.refAudios) });
/**
 * One picker row's quote params: the page's params as THIS model would run them (refFitOf): its mode (types), the start frame only where it
 * is used, and only the references it sends (refs = pictures sent in Reference mode, the start picture included; refVideos / refVideoSeconds
 * and refAudios dropped when it takes none). Unchanged when nothing is attached.
 */
export function rowRefParams(base: Record<string, string>, c: RefCapsOf): Record<string, string> {
  const a = attachedOf(base); if (!a.start && !a.image && !a.video && !a.audio) return base;
  const cur = String(base.types ?? ''); const f = refFitOf(c, a, cur); const out: Record<string, string> = { ...base };
  if (cur) out.types = f.mode;
  if (!['i2v', 'r2v', 'flf'].includes(f.mode)) delete out.image;
  const used = (k: RefKind) => f.parts.find(p => p.kind === k)?.used ?? 0;
  if (f.mode === 'r2v' && used('image') > 0) out.refs = String(used('image')); else delete out.refs;
  /* the clips it sends: their count, each one's seconds, and the billed total of those (Seedance bills reference video seconds) */
  const clips = (n: number, each: string, total: string) => { if (n > 0) { out[`ref${each}s`] = String(n); const l = String(base[`ref${each}SecondsEach`] ?? '').split(',').filter(Boolean);
      if (l.length) { const kept = l.slice(0, n); out[`ref${each}SecondsEach`] = kept.join(','); if (total) out[total] = String(Math.round(kept.reduce((x, y) => x + Number(y), 0) * 10) / 10); } }
    else { delete out[`ref${each}s`]; delete out[`ref${each}SecondsEach`]; if (total) delete out[total]; } };
  clips(used('video'), 'Video', 'refVideoSeconds'); clips(used('audio'), 'Audio', '');
  return out;
}
