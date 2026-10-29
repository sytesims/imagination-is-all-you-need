/**
 * Saved Elements auto-attach (per spec: references named in the prompt are attached automatically as Elements).
 * `@<element name>` → that element's image becomes a ref. Case-insensitive; spaces/underscores/hyphens in the name are interchangeable
 * ("flat two" matches @flat_two, @Flat-Two, @flat two); when several names match at one @, the longest wins.
 * `@imageN` / `@imgN` / `@videoN` stay positional refs. Any other `@word` is unknown (→ 400, nothing charged). A bare "@" is ignored.
 */
export interface ElementLike { id: string; name: string; url: string; kind?: string }
export interface AttachedElement { id: string; name: string; kind?: string; url: string; mention: string; start: number; end: number }
const norm = (s: string) => s.toLowerCase().replace(/[\s_-]+/g, ' ').trim();
const SEP = /[\s_-]/;
const REF = /^(image|img|video)\d*$/i;

export function resolveElements(prompt: string, elements: ElementLike[]): { attached: AttachedElement[]; mentions: AttachedElement[]; unknown: string[] } {
  const text = String(prompt ?? '');
  const cands = elements.map((e) => ({ e, n: norm(e.name) })).filter((c) => c.n).sort((a, b) => b.n.length - a.n.length);
  const mentions: AttachedElement[] = []; const unknown = new Set<string>();
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '@' || (i > 0 && /[\w@]/.test(text[i - 1]))) continue;
    const rest = text.slice(i + 1);
    let hit: { e: ElementLike; len: number } | null = null;
    for (const c of cands) { const len = matchLen(rest, c.n); if (len) { hit = { e: c.e, len }; break; } }
    if (hit) { const raw = text.slice(i, i + 1 + hit.len); mentions.push({ id: hit.e.id, name: hit.e.name, kind: hit.e.kind, url: hit.e.url, mention: raw, start: i, end: i + raw.length }); i += hit.len; continue; }
    const w = rest.match(/^[A-Za-z_][\w-]*/)?.[0];
    if (w && !REF.test(w)) unknown.add('@' + w.replace(/[-_]+$/, ''));
  }
  const seen = new Set<string>(); const attached = mentions.filter((m) => !seen.has(m.id) && seen.add(m.id));
  return { attached, mentions, unknown: [...unknown] };
}
/** Length of `s`'s prefix matching normalized name `n` (separators interchangeable), followed by a word boundary; 0 if none. */
function matchLen(s: string, n: string): number {
  let i = 0;
  for (let k = 0; k < n.length; k++) {
    if (n[k] === ' ') { if (!SEP.test(s[i] ?? '')) return 0; while (SEP.test(s[i] ?? '')) i++; continue; }
    if ((s[i] ?? '').toLowerCase() !== n[k]) return 0; i++;
  }
  return /[\w]/.test(s[i] ?? '') ? 0 : i;
}
