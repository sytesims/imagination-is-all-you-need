/** The toast system's pure rules (no React, no DOM), so they can be tested on their own (server/test/toast-logic.test.ts).
 *  Toast.tsx draws what these return. */
export type ToastKind = 'success' | 'info' | 'warn' | 'error';
export type ToastAction = { label: string; to?: string; /** a button instead of a link (Undo) */ onClick?: () => void };
export type ToastItem = { id: number; title: string; sub?: string; kind: ToastKind; detail?: string; action?: ToastAction; ms: number;
  /** how many times the same message arrived (shown as "×3") */ count: number; out?: boolean };

/** How many cards show at once; the rest wait behind a "+N" chip. */
export const VISIBLE = 3;
/** The most cards kept at all; past this the oldest one goes (an error only when nothing else is left to drop). */
export const KEEP = 12;

/** Split "Title. The rest." when the first sentence is short; otherwise the whole message is the title. */
export function splitMessage(msg: string): { title: string; sub?: string } {
  const m = msg.match(/^(.{2,64}?[.!])\s+(\S[\s\S]*)$/);
  return m ? { title: m[1].replace(/\.$/, ''), sub: m[2] } : { title: msg };
}

/* A plain confirmation that something the person asked for is done: "Prompt copied", "Saved “Moody”", "Moved to Trash",
 * "Trash emptied", "Background removed". A done-word in the first few words, never a refusal or a notice about something else. */
const DONE = /^(?:\S+\s){0,3}?(copied|saved|downloaded|restored|removed|renamed|deleted|emptied|added|finished|installed|moved|updated|created|exported|pulled out|loaded)\b/i;
const NOT_DONE = /^(couldn|could not|can.?t|cannot|nothing|no |not |that |this |your |failed|unable)|n[’']t\b|\bnot\b|\bnever\b/i;
/** The kind a toast shows as. Callers that leave the kind out (info) and say something got done get the orange success look;
 *  an explicit warn / error / success is kept. */
export function toastKind(title: string, kind: ToastKind = 'info'): ToastKind {
  if (kind !== 'info') return kind;
  const t = title.trim();
  return !NOT_DONE.test(t) && DONE.test(t) ? 'success' : 'info';
}

/** How long a toast stays (4–10 s): a plain confirmation is short; anything with more to read (a second line, a link,
 *  an error, the technical details) stays longer. */
export function lifeOf(it: { kind: ToastKind; sub?: string; action?: unknown; detail?: string }): number {
  return it.detail ? 10000 : it.kind === 'error' ? 8000 : it.sub || it.action ? 8000 : it.kind === 'warn' ? 6000 : 4000;
}

/** The same message again (same title, line and kind, still showing) merges into the card that is already up. */
export const sameToast = (a: Pick<ToastItem, 'title' | 'sub' | 'kind' | 'out'>, b: Pick<ToastItem, 'title' | 'sub' | 'kind'>) =>
  !a.out && a.title === b.title && a.sub === b.sub && a.kind === b.kind;

/** Add a toast to the list. A repeat bumps the count of the card already up (and its timer restarts);
 *  past KEEP cards the oldest non-error goes. Returns the new list and the id that should (re)start its timer. */
export function addToast(items: ToastItem[], next: Omit<ToastItem, 'id' | 'count'>, newId: number): { items: ToastItem[]; id: number; merged: boolean; dropped: number[] } {
  const same = items.find(x => sameToast(x, next));
  if (same) return { items: items.map(x => x === same ? { ...x, count: x.count + 1, ms: Math.max(x.ms, next.ms), action: next.action ?? x.action, detail: next.detail ?? x.detail } : x), id: same.id, merged: true, dropped: [] };
  let out = [...items, { ...next, id: newId, count: 1 }]; const dropped: number[] = [];
  while (out.filter(x => !x.out).length > KEEP) {
    const live = out.filter(x => !x.out); const victim = live.find(x => x.kind !== 'error') ?? live[0];
    dropped.push(victim.id); out = out.filter(x => x.id !== victim.id);
  }
  return { items: out, id: newId, merged: false, dropped };
}

/** Which cards show: the newest VISIBLE (cards on their way out keep their place until they are gone), and how many wait. */
export function visibleToasts(items: ToastItem[], expanded = false): { shown: ToastItem[]; hidden: number } {
  if (expanded) return { shown: items, hidden: 0 };
  const live = items.filter(x => !x.out); const keep = new Set(live.slice(-VISIBLE).map(x => x.id));
  return { shown: items.filter(x => x.out || keep.has(x.id)), hidden: Math.max(0, live.length - VISIBLE) };
}

/** The title with its repeat count: "Saved ×3". */
export const titleWithCount = (it: Pick<ToastItem, 'title' | 'count'>) => it.count > 1 ? `${it.title} ×${it.count}` : it.title;

/** How far above the bottom of the window the stack sits so it never covers the composer / Generate dock, a phone tab bar
 *  or the viewer's filmstrip. `boxes` are those bars' rectangles; only ones that sit low in the window and under the
 *  stack's column count. */
export function toastBottom(boxes: { top: number; bottom: number; left: number; right: number }[], view: { w: number; h: number }, colW: number, base: number, gap = 12): number {
  const l = (view.w - colW) / 2, r = l + colW; let lift = 0;
  for (const b of boxes) {
    if (b.bottom - b.top <= 0 || b.right - b.left <= 0) continue; // hidden
    if (b.bottom - b.top > view.h * 0.6) continue; // a full-page panel, not a bar
    if (b.bottom < view.h - 240 || b.top >= view.h) continue; // not at the bottom of the window
    if (b.right <= l || b.left >= r) continue; // beside the stack, not under it
    lift = Math.max(lift, view.h - b.top);
  }
  return lift > 0 ? Math.round(lift + gap) : base;
}
