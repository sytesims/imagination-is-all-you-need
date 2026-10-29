/**
 * @ mentions in prompts: `@image1` / `@img1` (reference N), `@video` / `@video1` / `@Video 1` (source video).
 * `@image?` = a stale mention left behind when its reference was removed (see renumberMentions).
 * Isomorphic (server validation + web chips).
 */
export type MentionKind = 'image' | 'video';
export interface Mention { kind: MentionKind; index: number | null; start: number; end: number; raw: string }
export interface MentionIssue { mention: Mention; code: 'missing_image' | 'missing_video' | 'stale'; message: string }
const RE = /@(image|img|video)(?: ?(\d+)|(\?))?(?![\w?])/gi;
export function parseMentions(prompt: string): Mention[] {
  const out: Mention[] = [];
  for (const m of prompt.matchAll(RE)) {
    const kind: MentionKind = m[1].toLowerCase() === 'video' ? 'video' : 'image';
    if (kind === 'image' && !m[2] && !m[3]) continue; // bare "@image" isn't a reference
    out.push({ kind, index: m[3] ? null : m[2] ? Number(m[2]) : 1, start: m.index!, end: m.index! + m[0].length, raw: m[0] });
  }
  return out;
}
/** Director: any `@word` that isn't a known reference (@imageN/@imgN/@videoN). Bare/malformed "@" (no word) is ignored. Deduped. */
export function unknownMentions(prompt: string): string[] {
  const out = new Set<string>();
  for (const m of String(prompt ?? '').matchAll(/(^|[^\w@])@([A-Za-z_][\w-]*)/g)) {
    if (/^(image|img|video)\d*$/i.test(m[2])) continue;
    out.add('@' + m[2]);
  }
  return [...out];
}
/** Chip text: "@image1" / "@Video 1" / "@image?" */
export const mentionLabel = (m: Pick<Mention, 'kind' | 'index'>) => m.kind === 'video' ? `@Video ${m.index ?? '?'}` : `@image${m.index ?? '?'}`;
export function validateMentions(prompt: string, have: { images: number; videos: number }): { ok: boolean; mentions: Mention[]; issues: MentionIssue[] } {
  const mentions = parseMentions(prompt); const issues: MentionIssue[] = [];
  for (const m of mentions) {
    if (m.index == null) issues.push({ mention: m, code: 'stale', message: `${m.raw} points to ${m.kind === 'image' ? 'a photo' : 'a video'} you removed. Delete it, or add the ${m.kind === 'image' ? 'photo' : 'video'} again and write its number.` });
    else if (m.kind === 'image' && (m.index < 1 || m.index > have.images)) issues.push({ mention: m, code: 'missing_image', message: have.images ? `${m.raw} has no photo (${have.images} attached). Add it again or delete the mention.` : `${m.raw} has no photo. Add one or delete the mention.` });
    else if (m.kind === 'video' && (m.index < 1 || m.index > have.videos)) issues.push({ mention: m, code: 'missing_video', message: have.videos ? `${m.raw} doesn't exist: only ${have.videos} video is attached.` : `${m.raw} needs a video. Upload one or delete the mention.` });
  }
  return { ok: !issues.length, mentions, issues };
}
/** After removing reference `removed` (1-based): later refs shift down (@image3 → @image2); mentions of the removed one become `@image?` (stale, shown red). */
export function renumberMentions(prompt: string, kind: MentionKind, removed: number): string {
  let out = ''; let last = 0;
  for (const m of parseMentions(prompt)) {
    if (m.kind !== kind || m.index == null) continue;
    out += prompt.slice(last, m.start); last = m.end;
    const word = kind === 'video' ? '@video' : '@image';
    out += m.index === removed ? `${word}?` : m.index > removed ? `${word}${m.index - 1}` : m.raw;
  }
  return out + prompt.slice(last);
}
/** Create Image: attached image n (1-based) was removed (QA #10). No word of the prompt is deleted: later @image mentions move down one
 *  (@image3 → @image2) and the removed photo's own mentions stay in place as "@image?", which validateMentions flags ("points to a photo you
 *  removed"), so the sentence keeps its meaning and the person decides what goes there. */
export const removeImageMention = (prompt: string, removed: number): string => renumberMentions(prompt, 'image', removed);
/** A restored draft (QA #3): `restored[i]` says whether photo i+1 came back. Photos that didn't are removed from the numbering, from the
 *  last to the first, so the photos that did come back keep their mentions and a mention of a lost one stays visible as "@image?". */
export function mentionsAfterRestore(prompt: string, restored: boolean[]): string {
  let out = prompt; for (let i = restored.length - 1; i >= 0; i--) if (!restored[i]) out = removeImageMention(out, i + 1); return out;
}
/** Unique 1-based image indexes mentioned (legacy helper). */
export const imageMentions = (prompt: string) => [...new Set(parseMentions(prompt).filter((m) => m.kind === 'image' && m.index).map((m) => m.index!))];
