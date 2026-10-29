import type { JobState } from '../api';
/** Assets grid helpers: date groups, native aspect ratios, justified rows (desktop) and 2-column masonry (phones). Pure, no DOM. */

const pad = (n: number) => String(n).padStart(2, '0');
export const dayKey = (t?: number | null) => { if (!t) return ''; const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
/** "Today", "Yesterday", else "October 13, 2026". */
export function dayLabel(key: string, now = Date.now()) {
  if (!key) return 'Undated'; if (key === dayKey(now)) return 'Today'; if (key === dayKey(now - 864e5)) return 'Yesterday';
  const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}
/** Consecutive runs of the same calendar day, in list order (so either sort direction groups correctly). */
export function groupByDay<T extends { createdAt?: number }>(items: T[]): { key: string; items: T[] }[] {
  const out: { key: string; items: T[] }[] = [];
  for (const j of items) { const k = dayKey(j.createdAt); const last = out[out.length - 1]; if (last && last.key === k) last.items.push(j); else out.push({ key: k, items: [j] }); }
  return out;
}
/** Local From/To days → ISO bounds for GET /api/jobs. */
export const rangeBounds = (from: string, to: string) => ({ ...(from ? { from: new Date(`${from}T00:00:00`).toISOString() } : {}), ...(to ? { to: new Date(`${to}T23:59:59.999`).toISOString() } : {}) });
export const daysAgo = (n: number) => dayKey(Date.now() - n * 864e5);

const ratio = (s: unknown) => { const m = String(s ?? '').match(/^(\d+(?:\.\d+)?)\s*[:x/]\s*(\d+(?:\.\d+)?)$/); return m && +m[1] > 0 && +m[2] > 0 ? +m[1] / +m[2] : 0; };
/** Width / height for a tile: measured (cache) → output width/height → the aspect the job asked for → 1:1. Clamped so a panorama or a strip stays usable. */
export function aspectOf(j: JobState, measured?: number) {
  const o: any = j.outputs?.[0]; const a = measured || (o?.width > 0 && o?.height > 0 ? o.width / o.height : 0) || ratio((j as any).aspectLabel) || ratio(j.input?.aspect) || 1;
  return Math.min(2.4, Math.max(0.42, a));
}

export type Box = { id: string; w: number; h: number };
/** Justified rows: fill each row to the width at about `target` px tall; the last row keeps the target height. */
export function justify(items: { id: string; a: number }[], width: number, target: number, gap: number): Box[][] {
  const rows: Box[][] = []; let row: { id: string; a: number }[] = []; let sum = 0;
  const flush = (last: boolean) => { if (!row.length) return; const free = width - gap * (row.length - 1); const h = last ? Math.min(target, free / sum) : free / sum;
    rows.push(row.map(r => ({ id: r.id, w: Math.floor(r.a * h * 100) / 100, h: Math.round(h) }))); row = []; sum = 0; };
  for (const it of items) { row.push(it); sum += it.a; if (sum * target + gap * (row.length - 1) >= width) flush(false); }
  flush(true); return rows;
}
/** Phones: two columns, each item into the shorter one. */
export function masonry(items: { id: string; a: number }[], cols = 2): { id: string; a: number }[][] {
  const out: { id: string; a: number }[][] = Array.from({ length: cols }, () => []); const hs = Array(cols).fill(0);
  for (const it of items) { const c = hs.indexOf(Math.min(...hs)); out[c].push(it); hs[c] += 1 / it.a; }
  return out;
}
export const fmtDur = (s?: number | null) => { if (!s || !isFinite(s)) return ''; const r = Math.round(s); return `${Math.floor(r / 60)}:${pad(r % 60)}`; };
