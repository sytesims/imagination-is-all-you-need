/**
 * Where an image goes when it enters Create Image (pure, no React; server/test/image-intake.test.ts).
 * Every way in (the "+" picker, a workflow slot's picker, drag-drop, paste, Reference from the viewer, "Use in Create" hand-offs,
 * Recreate) ends in one of: Create's own photos (plain Create), one named workflow slot, or a tiny "Use as …" chooser in the bar.
 */
export interface IntakeSlot { name: string; label: string; order: number; required?: boolean }
export type Placement =
  | { kind: 'slot'; slot: string; replaced: boolean }
  | { kind: 'ask'; slots: string[] }
  | { kind: 'none' };

/** An image arriving without a named slot (Reference, a drop on the bar, a paste, a hand-off):
 *  the only empty slot gets it; several empty slots (or several full ones) → ask which; a single-slot workflow that is full → replace it. */
export function placeIncoming(slots: IntakeSlot[], filled: (name: string) => boolean): Placement {
  const ss = [...slots].sort((a, b) => a.order - b.order); if (!ss.length) return { kind: 'none' };
  const empty = ss.filter(s => !filled(s.name));
  if (empty.length === 1) return { kind: 'slot', slot: empty[0].name, replaced: false };
  if (empty.length > 1) return { kind: 'ask', slots: empty.map(s => s.name) };
  return ss.length === 1 ? { kind: 'slot', slot: ss[0].name, replaced: true } : { kind: 'ask', slots: ss.map(s => s.name) };
}

/** Query keys that bring an image or settings into the page (shared/usePrefill.ts). */
export const HANDOFF_KEYS = ['fromJob', 'recreate', 'recreatePreset', 'example', 'sample', 'from', 'refUrl'] as const;

/**
 * A navigation to Create Image while it is already open (the viewer's Reference / Edit with a prompt / Recreate, Send to): which workflow
 * the bar shows afterwards. `?workflow=` wins. A reference (`as=ref`) keeps the picked workflow (it fills a slot). Any other hand-off is
 * "edit this in Create" (or a plain Create recreate), so the bar goes back to plain Create. A plain link keeps what is picked.
 */
export function workflowAfterNav(search: string, current: string): string {
  const q = new URLSearchParams(search); const w = q.get('workflow'); if (w != null) return w;
  if (!HANDOFF_KEYS.some(k => q.has(k))) return current;
  if ((q.has('fromJob') && q.get('as') === 'ref') || q.has('refUrl')) return current; // a reference keeps the workflow (it fills a slot)
  return '';
}
