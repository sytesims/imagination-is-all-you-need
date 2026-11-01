/**
 * Add logo and text: the settings (remembered in this browser) and the on / off switch (for this visit only, so a forgotten switch never
 * stamps tomorrow's downloads). One store for the viewer's stage layer, its Save tile and Share.
 */
import { useSyncExternalStore } from 'react';
import { normStamp, STAMP_DEFAULTS, type StampInset, type StampSettings } from '../../../server/src/shared/logoStamp';

const LS = 'ohf.logoStamp.v1';
const read = (): StampSettings => { try { const v = localStorage.getItem(LS); return v ? normStamp({ ...JSON.parse(v), text: '' }) : STAMP_DEFAULTS; } catch { return STAMP_DEFAULTS; } };
/** Adjust logo (an Ad Pack ad's baked logo, opened in the viewer): one entry per ad (`<job>:<output>`), for this visit only, never stored.
 *  touched: moved, resized or taken off since it opened (until then Save gives the ad as made). */
export interface AdjustState { on: boolean; settings: StampSettings; inset: StampInset; touched: boolean }
let st: { on: boolean; settings: StampSettings; adjust: Record<string, AdjustState>; /** logo-only results: the text line per result, this visit */ textFor: Record<string, boolean> } = { on: false, settings: read(), adjust: {}, textFor: {} };
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
/** A brand app's video (UGC Ad, user 2026-11-01): Add logo puts the logo only; the text line stays an option, turned on per result for this
 *  visit (`key` = <job>:<output>), never changing the remembered settings. Without a key: the shared settings. */
export function stampSettingsFor(s: typeof st, logoOnlyKey?: string | null): StampSettings {
  return logoOnlyKey ? { ...s.settings, textOn: s.textFor[logoOnlyKey] ?? false } : s.settings;
}
export function setTextFor(key: string, on: boolean) { st = { ...st, textFor: { ...st.textFor, [key]: on } }; emit(); }
export function useStamp() { return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => st, () => st); }
/** Open Adjust logo on one ad, set to where Ad Pack put the logo (shared/adPack.ts adLogoStamp). */
export function startAdjust(key: string, preset: { settings: StampSettings; inset: StampInset }) { st = { ...st, adjust: { ...st.adjust, [key]: { on: true, settings: normStamp(preset.settings), inset: preset.inset, touched: false } } }; emit(); }
/** A change while adjusting (kept for this ad only; the Add logo settings stay as they were). */
export function setAdjust(key: string, p: Partial<StampSettings>) { const a = st.adjust[key]; if (!a) return; st = { ...st, adjust: { ...st.adjust, [key]: { ...a, settings: normStamp({ ...a.settings, ...p }), touched: true } } }; emit(); }
export function setAdjustOn(key: string, on: boolean) { const a = st.adjust[key]; if (!a) return; st = { ...st, adjust: { ...st.adjust, [key]: { ...a, on, touched: true } } }; emit(); }
/** Reset logo: back to the ad as made. */
export function endAdjust(key: string) { if (!st.adjust[key]) return; const { [key]: _drop, ...rest } = st.adjust; st = { ...st, adjust: rest }; emit(); }
