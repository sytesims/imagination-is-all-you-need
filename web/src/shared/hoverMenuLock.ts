/**
 * Click-to-close for hover-open menus (2026-10-25; header menus in ui/Shell.tsx, Image / Video / Audio / 3D / More and Account).
 * Picking an item (click, middle-click, cmd/ctrl-click, Enter or Space) closes the menu at once, and hover can't reopen it until the
 * pointer has left the trigger and the menu once: otherwise the pointer resting where the panel was would bring it straight back.
 * Pure (no React, no DOM globals), tested in server/test/hover-menu-lock.test.ts.
 */

/** The event picks the item it lands on: a click (any modifier), a middle-click, or Enter / Space on it. */
export function isMenuActivation(e: { type: string; key?: string; button?: number }): boolean {
  if (e.type === 'click') return true;
  if (e.type === 'auxclick') return e.button === 1;
  if (e.type === 'keydown') return e.key === 'Enter' || e.key === ' ';
  return false;
}

/** Elements a pointer can be "inside the menu" on: the triggers and the panels. */
export const HOVER_MENU_ZONE = '.nav-dd,.hm-panel,.tn-menu-wrap';

/** Hover lock: `lock(id)` after an item is picked with the pointer; `pointerAt(insideZone)` on each pointer move releases it once the
 *  pointer is outside; `canHoverOpen(id)` gates hover-open only: the menu that was just used stays shut, while hovering a different trigger
 *  (the pointer clearly moved on) opens that one and releases the lock. Clicks, focus and keys still open any menu (`unlock`). */
export function createHoverLock<T = string>() {
  let locked: { id: T | null } | null = null;
  return {
    lock(id: T | null = null) { locked = { id }; },
    unlock() { locked = null; },
    /** a pointer move: outside the triggers and menus releases the lock */
    pointerAt(insideZone: boolean) { if (!insideZone) locked = null; },
    canHoverOpen(id?: T) { if (!locked) return true; if (locked.id != null && id != null && id !== locked.id) { locked = null; return true; } return false; },
    get locked() { return !!locked; },
  };
}
export type HoverLock<T = string> = ReturnType<typeof createHoverLock<T>>;
