import type React from 'react';
import { navigate } from '../platform/router';

/**
 * "Go to a workflow with these inputs" (2026-10-27): the one way every result action leaves for another page (Recreate, Continue, Extend,
 * Use frame, Reference, Edit, Upscale, Make it talk, Send to 3D, Open in tool, Change settings…), from every surface (Assets, Profile, Explore,
 * the Image / Video / Audio / 3D feeds, Canvas, job pages).
 *
 * - The target is pushed (never replaced), so Back returns to the page the action came from.
 * - A viewer whose open state lives in the URL (/jobs/:id over Assets or Profile, ?view=<id>, Community ?shot=) is NOT closed first: its close
 *   is history.back(), which is asynchronous and raced the push (Assets → viewer → Recreate landed back on Assets). The push itself leaves the
 *   viewer, and Back reopens it where it was.
 * - A viewer held in page state (a feed's) is closed first, so it never stays open over the new page (the same page, when the action targets
 *   the tab it sits on).
 * - The prefill runs once: navigate() fires popstate, so a page already open on that path re-reads the query (shared/usePrefill.ts, its
 *   prefillGate drops an older one's late loads); a page that mounts reads it on mount.
 */
export const viewerInUrl = (loc: { pathname: string; search: string } = location): boolean => /^\/jobs\//.test(loc.pathname) || /[?&](view|shot)=/.test(loc.search);

export function goToWorkflow(href: string, close?: (() => void) | null): void {
  if (!viewerInUrl()) close?.();
  navigate(href);
}

/** onClick for an <a href={href}>: a plain click goes in-app (goToWorkflow); Cmd / Ctrl / Shift / middle click keep the browser's own behaviour. */
export const goClick = (href: string, close?: (() => void) | null) => (e: React.MouseEvent) => {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return; e.preventDefault(); goToWorkflow(href, close);
};
