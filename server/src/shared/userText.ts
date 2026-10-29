/**
 * User-facing label guard: labels never carry backend notes ("(mock)", "· mock", "mock only", "mock placeholder")
 * or GPU-unit wording. The backend stays in data fields (providers[].backend, models[].mockOnly, via).
 */
export function userLabel(s: string | null | undefined): string {
  if (!s) return s ?? '';
  return s
    .replace(/\s*[·•]\s*mock\b/gi, '')
    .replace(/\s*\((?:hosted,\s*)?mock(?: only)?\)/gi, (m) => (/hosted/i.test(m) ? ' (hosted)' : ''))
    .replace(/,\s*mock (?:only|placeholder)\b[^)]*/gi, '')
    .replace(/\s*\(mock (?:only|placeholder|unless [^)]*)[^)]*\)/gi, '')
    .replace(/\bGPU[- ]credits?\b/gi, 'credits')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
export const isMockOnly = (via?: string | null) => /mock (?:only|placeholder)/i.test(via ?? '');
/**
 * Indefinite article for user copy: 'an 8 s clip', 'an 11 s clip', 'a 5 s clip', 'an image', 'a user'.
 * Numbers go by how they are read: 8, 80–89, 800…, 18, 11 (and 11/18 thousand…) start with a vowel sound.
 */
export function article(x: string | number): 'a' | 'an' {
  const s = String(x).trim();
  if (/^\d/.test(s)) { const int = s.split(/[.,\s]/)[0];
    if (int.startsWith('8')) return 'an';
    return /^1[18]/.test(int) && int.length % 3 === 2 ? 'an' : 'a'; } // 11, 18, 11000, 18000000 ("eleven…", "eighteen…"); 110, 1800 are "one hundred…", "one thousand…"
  if (/^(hour|honest|honou?r|heir)/i.test(s)) return 'an';
  if (/^(uni|use|usu|eu|one|once|ur[aeiou])/i.test(s)) return 'a';
  return /^[aeiou]/i.test(s) ? 'an' : 'a';
}
/** `${article(x)} ${x}`: 'an 8', 'a 5', 'an image'. */
export const withArticle = (x: string | number) => `${article(x)} ${x}`;
