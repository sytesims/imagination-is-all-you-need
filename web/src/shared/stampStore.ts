/**
 * Add logo and text: the settings (remembered in this browser) and the on / off switch (for this visit only, so a forgotten switch never
 * stamps tomorrow's downloads). One store for the viewer's stage layer, its Save tile and Share.
 */
import { useSyncExternalStore } from 'react';
import { normStamp, STAMP_DEFAULTS, type StampSettings } from '../../../server/src/shared/logoStamp';

const LS = 'ohf.logoStamp.v1';
const read = (): StampSettings => { try { const v = localStorage.getItem(LS); return v ? normStamp({ ...JSON.parse(v), text: '' }) : STAMP_DEFAULTS; } catch { return STAMP_DEFAULTS; } };
let st: { on: boolean; settings: StampSettings } = { on: false, settings: read() };
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
/** Settings change: kept in this browser (the text line is per visit: it defaults to the brand's name). */
export function setStamp(p: Partial<StampSettings>) {
  const settings = normStamp({ ...st.settings, ...p }); st = { ...st, settings };
  try { const { text: _t, ...keep } = settings; localStorage.setItem(LS, JSON.stringify(keep)); } catch { /* storage off */ }
  emit();
}
export function setStampOn(on: boolean) { st = { ...st, on }; emit(); }
export const stampState = () => st;
export function useStamp() { return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => st, () => st); }
