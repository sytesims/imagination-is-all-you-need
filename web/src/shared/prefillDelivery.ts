/**
 * Recreate / example prefill (2026-10-26 fix): which page handler gets which of a job's files, and how a page's slots change. Pure, so
 * server/test/recreate-replace.test.ts checks it. The bug it fixes: a Recreate on an open page ADDED the job's references to what the slot
 * held (the last job's people stayed as Image 1 and 2), and sent them twice (onRefs and onFiles('refs')), so Motion Control showed 6 images.
 */

export type Delivery = { to: 'video' | 'image' | 'refs' | 'files'; slot: string; urls: string[] };
export type Handlers = { onVideo?: unknown; onImage?: unknown; onRefs?: unknown; onFiles?: unknown };

/** The job's files in delivery order, each slot ONCE: main clip → onVideo, start image → onImage, references → onRefs (the full ordered set),
 *  every other slot → onFiles(slot). `refs` goes through onFiles only when the page has no onRefs. */
export function planJobFiles(h: Handlers, ex: { video?: string; image?: string; refs?: string[] }, fl: Record<string, string[]>): Delivery[] {
  const out: Delivery[] = [];
  if (h.onVideo && ex.video) out.push({ to: 'video', slot: 'video', urls: [ex.video] });
  // C10: never promote a reference to the start image; a page with onRefs / onFiles gets refs in their own slot, and a job without a start image recreates without one.
  const img = ex.image ?? (h.onRefs || h.onFiles ? undefined : ex.refs?.[0]);
  if (h.onImage && img) out.push({ to: 'image', slot: 'image', urls: [img] });
  const viaRefs = !!(h.onRefs && ex.refs?.length);
  if (viaRefs) out.push({ to: 'refs', slot: 'refs', urls: [...ex.refs!] });
  if (h.onFiles) for (const [k, us] of Object.entries(fl)) { if (!Array.isArray(us) || !us.length || (k === 'refs' && viaRefs)) continue; out.push({ to: 'files', slot: k, urls: [...us] }); }
  return out;
}

/** A page's file slots (slot name → files in order) and what a prefill does to them. */
export type Slots<F> = Record<string, F[]>;
export type SlotAction<F> =
  | { kind: 'reset' } /* a full prefill (Recreate, example, preset) starts: every slot empties */
  | { kind: 'put'; slot: string; files: F[] } /* a Recreate's set for one slot: exactly these, in order */
  | { kind: 'add'; slot: string; files: F[]; max: number } /* a hand-off / pick: added after what is there, up to the model's most */;
export function slotsReducer<F>(s: Slots<F>, a: SlotAction<F>): Slots<F> {
  if (a.kind === 'reset') return {};
  if (a.kind === 'put') return { ...s, [a.slot]: [...a.files] };
  const cur = s[a.slot] ?? []; const room = Math.max(0, a.max - cur.length); return { ...s, [a.slot]: [...cur, ...a.files.slice(0, room)] };
}

/** One prefill at a time: begin() returns live(), true until a newer prefill begins (its late file loads and toasts are dropped, never mixed in). */
export function prefillGate() { let gen = 0; return { begin: () => { const my = ++gen; return () => my === gen; } }; }
