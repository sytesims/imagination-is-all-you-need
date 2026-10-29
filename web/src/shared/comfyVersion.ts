import { useEffect, useState } from 'react';

/** The local ComfyUI version from the self-host health check (null while unknown). Fetched once per page load. */
let cached: string | null | undefined; let inflight: Promise<string | null> | null = null;
const load = () => inflight ??= fetch('/api/health/self-host').then(r => r.ok ? r.json() : null).then(h => (cached = typeof h?.comfy?.version === 'string' ? h.comfy.version : null)).catch(() => (cached = null));
export function useComfyVersion(): string | null {
  const [v, setV] = useState<string | null>(cached ?? null);
  useEffect(() => { if (cached === undefined) load().then(setV); }, []);
  return v;
}
const parts = (s: string) => s.replace(/^v/i, '').split(/[.+-]/).slice(0, 3).map(n => parseInt(n, 10) || 0);
/** true when `have` is known and older than `min`. */
export function olderThan(have: string | null | undefined, min: string | null | undefined): boolean {
  if (!have || !min) return false; const a = parts(have), b = parts(min);
  for (let i = 0; i < 3; i++) { if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) < (b[i] ?? 0); } return false;
}
export const minComfyOf = (...xs: any[]): string | null => { for (const x of xs) if (typeof x?.minComfyVersion === 'string' && x.minComfyVersion) return x.minComfyVersion; return null; };
export const minComfyHint = (min: string) => `Needs ComfyUI ≥ ${min}`;
export const minComfyBlock = (min: string, have: string) => `Needs ComfyUI ≥ ${min} (this computer has ${have})`;
/** The server's own ComfyUI-version sentence inside a description ("Needs ComfyUI 0.41.3 or newer."), split out so the note is shown
 *  once, in the server's words. `rest` is the description without it. */
export function splitComfyNote(desc?: string | null): { rest: string; note: string | null } {
  const d = String(desc ?? ''); const m = d.match(/\s*(Needs ComfyUI[^.]*?\d+\.\d+(?:\.\d+)?[^.]*\.?)\s*/i);
  if (!m) return { rest: d, note: null };
  return { rest: (d.slice(0, m.index) + ' ' + d.slice((m.index ?? 0) + m[0].length)).replace(/\s{2,}/g, ' ').trim(), note: m[1].replace(/\.?$/, '.').trim() };
}
/** The one note to show for a model with a minimum ComfyUI version: the server's sentence when it has one, else ours. */
export const comfyNote = (min: string, desc?: string | null) => splitComfyNote(desc).note ?? `${minComfyHint(min)}.`;
