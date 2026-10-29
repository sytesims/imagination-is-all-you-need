/** /terms: plain usage and licence notes, rendered from docs/USAGE-NOTES.md (docs/TERMS.md is now a pointer to it).
 *  Read-only docs: no acceptance step, no checkbox, nothing stored. */
import notes from '../../../../docs/USAGE-NOTES.md?raw';
/** B33: in-repo doc links map to their app pages (anchors kept), so they never 404 in the app. */
const mapDoc = (u: string): string => {
  const m = /^(?:\.\.\/|\.\/)*(?:docs\/)?(USAGE-NOTES|LICENSES)\.md(#[\w-]*)?$/i.exec(u);
  if (!m) return u;
  return (m[1].toUpperCase() === 'LICENSES' ? '/licenses' : '/terms') + (m[2] ?? '');
};

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** Inline markdown on escaped text; the docs' table cells use <ul><li>, which is let back through as-is (nothing else). */
const inline = (s: string) => esc(s)
  .replace(/&lt;(\/?)(ul|li)&gt;/g, '<$1$2>')
  .replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
  .replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
  .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, t, u) => `<a href="${mapDoc(u)}">${t}</a>`)
  .replace(/(^|[\s(·])(https:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank" rel="noreferrer">$2</a>')
  .replace(/(^|[\s(])(\/licenses)\b/g, '$1<a href="$2">$2</a>');

export function renderMd(md: string): string {
  const L = md.replace(/\r/g, '').split('\n'); const out: string[] = []; let i = 0;
  while (i < L.length) {
    const l = L[i];
    if (!l.trim()) { i++; continue; }
    const h = /^(#{1,4})\s+(.*)$/.exec(l); if (h) { const n = Math.min(4, h[1].length + 1); out.push(`<h${n}>${inline(h[2])}</h${n}>`); i++; continue; }
    if (/^---+\s*$/.test(l)) { out.push('<hr/>'); i++; continue; }
    if (/^\|/.test(l)) { const rows: string[][] = []; while (i < L.length && /^\|/.test(L[i])) { if (!/^\|[\s|:-]+\|?\s*$/.test(L[i])) rows.push(L[i].replace(/^\||\|\s*$/g, '').split('|').map(c => c.trim())); i++; }
      const [head, ...body] = rows; out.push(`<div class="terms-tw"><table><thead><tr>${head.map(c => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${body.map(r => `<tr>${r.map(c => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`); continue; }
    if (/^\s*- /.test(l)) { let html = '<ul>'; let depth = 0;
      while (i < L.length && /^\s*- /.test(L[i])) { const d = Math.floor((/^(\s*)/.exec(L[i])![1].length) / 2); while (d > depth) { html += '<ul>'; depth++; } while (d < depth) { html += '</ul>'; depth--; } html += `<li>${inline(L[i].replace(/^\s*- /, ''))}</li>`; i++; }
      while (depth-- > 0) html += '</ul>'; out.push(html + '</ul>'); continue; }
    const para: string[] = []; while (i < L.length && L[i].trim() && !/^(#|\||\s*- |---)/.test(L[i])) para.push(L[i++]); out.push(`<p>${inline(para.join(' '))}</p>`);
  }
  return out.join('\n');
}

/** The document title is the page's one h1 (the markdown's top-level heading renders as h2 elsewhere). */
const html = renderMd(notes).replace(/<h2>([\s\S]*?)<\/h2>/, '<h1 class="terms-h1">$1</h1>');
export default function TermsPage() {
  return <article className="terms-doc" data-testid="terms-doc" dangerouslySetInnerHTML={{ __html: html }} />;
}
