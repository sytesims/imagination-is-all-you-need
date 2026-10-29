/**
 * Reference mentions in a prompt, split for display (composer layer, result viewer, feed cards). Pure, no React, so tests run it under tsx.
 * Same tokens the server rewrites per model (server/src/shared/promptRefs.ts MENTION) and validates (shared/mentions.ts):
 * @image1 · @img2 · @Image 1 · @video / @video2 · @audio / @audio1 · "@image?" (a removed photo, see renumberMentions). A bare "@image" is no reference.
 * Display only: the stored prompt text is never changed here.
 */
export type RefKind = 'image' | 'video' | 'audio';
/** What is attached, per kind. A kind left out is "unknown": its mentions show as plain chips, never as a warning. */
export type RefCounts = Partial<Record<RefKind, number>>;
export interface RefMention { kind: RefKind; index: number | null; state: 'ok' | 'missing' | 'stale' | 'unknown'; tip: string }
export interface MentionSeg { text: string; start: number; end: number; ref?: RefMention; other?: boolean }

const REF = /@(image|img|video|audio)(?: ?(\d+)|(\?))?(?![\w?])/gi;
const OTHER = /[@#][\w-]+/g;
const NOUN: Record<RefKind, string> = { image: 'image', video: 'video', audio: 'audio' };

/** One mention's state against the attached inputs. */
export function refState(kind: RefKind, index: number | null, counts?: RefCounts): Pick<RefMention, 'state' | 'tip'> {
  const n = NOUN[kind];
  if (index == null) return { state: 'stale', tip: `Its ${n} was removed. Add it again or delete the mention` };
  const have = counts?.[kind];
  if (have == null) return { state: 'unknown', tip: `${n[0].toUpperCase()}${n.slice(1)} ${index}` };
  if (index < 1 || index > have) return { state: 'missing', tip: `No ${n} ${index} attached` };
  return { state: 'ok', tip: `Linked to ${n} ${index}` };
}

/** Reference mentions only, in order. */
export function refMentions(text: string, counts?: RefCounts): (RefMention & { start: number; end: number; raw: string })[] {
  const out: (RefMention & { start: number; end: number; raw: string })[] = [];
  for (const m of String(text ?? '').matchAll(REF)) {
    const w = m[1].toLowerCase(); const kind: RefKind = w === 'video' ? 'video' : w === 'audio' ? 'audio' : 'image';
    if (kind === 'image' && !m[2] && !m[3]) continue; // bare "@image"
    const index = m[3] ? null : m[2] ? Number(m[2]) : 1;
    out.push({ kind, index, ...refState(kind, index, counts), start: m.index!, end: m.index! + m[0].length, raw: m[0] });
  }
  return out;
}

/** The text cut into plain runs and mentions. `others`: also mark any other @name / #move (the result viewer's elements and camera moves). */
export function mentionSegments(text: string, counts?: RefCounts, opts: { others?: boolean } = {}): MentionSeg[] {
  const s = String(text ?? ''); const segs: MentionSeg[] = []; let last = 0;
  const plain = (a: number, b: number) => {
    if (b <= a) return;
    if (!opts.others) { segs.push({ text: s.slice(a, b), start: a, end: b }); return; }
    let p = a; const chunk = s.slice(a, b);
    for (const m of chunk.matchAll(OTHER)) { const st = a + m.index!; if (st > p) segs.push({ text: s.slice(p, st), start: p, end: st }); segs.push({ text: m[0], start: st, end: st + m[0].length, other: true }); p = st + m[0].length; }
    if (p < b) segs.push({ text: s.slice(p, b), start: p, end: b });
  };
  for (const r of refMentions(s, counts)) { plain(last, r.start); segs.push({ text: r.raw, start: r.start, end: r.end, ref: { kind: r.kind, index: r.index, state: r.state, tip: r.tip } }); last = r.end; }
  plain(last, s.length);
  return segs;
}

/** True when the text has at least one reference mention (the composer only draws its layer then). */
export const hasRefMention = (text: string) => refMentions(text).length > 0;
