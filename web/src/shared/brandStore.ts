/**
 * Brand Kit on the web (2026-10-27): the kits (GET /api/brand-kits), the active one, and whether "Brand: <name>" is on in the Image, Video
 * and Audio bars. One store, so the chip, the submit (tools/app/AppTool), the prompt peek and Assets › Brand always agree.
 * The on / off switch is per media and per browser (localStorage); the kit picked in a bar's chip is the server's active kit (PUT /api/brand-kits/active),
 * so agents and the MCP read the same one. Each kit's font files are added to the page as they arrive (brandFonts.ts), so brand fonts work app-wide. Recreate turns Brand back on with the job's kit (shared/usePrefill → brandFromRecreate).
 */
import { useEffect, useState } from 'react';
import { brandAccentLead, brandMediaFor, normalizeKit, type BrandKit, type BrandMediaKind } from '../../../server/src/shared/brandKit';
import { registerBrandFonts } from './brandFonts';

export interface BrandState { kits: BrandKit[]; activeId: string; on: Record<BrandMediaKind, boolean>; /** the logo apps' "Use brand colours" (off by default) */ colours: boolean; loaded: boolean; error: string | null; fonts: { name: string; kind: string; inApp?: boolean }[] }
const LS = (m: BrandMediaKind) => `ohf:brand-on:${m}`;
const readOn = (m: BrandMediaKind) => { try { return localStorage.getItem(LS(m)) === '1'; } catch { return false; } };
const LS_COLOURS = 'ohf:brand-colours';
let st: BrandState = { kits: [], activeId: '', on: { image: readOn('image'), video: readOn('video'), audio: readOn('audio') }, colours: (() => { try { return localStorage.getItem(LS_COLOURS) === '1'; } catch { return false; } })(), loaded: false, error: null, fonts: [] };
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
const set = (p: Partial<BrandState>) => { st = { ...st, ...p }; emit(); };
let inflight: Promise<void> | null = null;

/** (Re)load the kits from the server. */
export function loadBrandKits(force = false): Promise<void> {
  if (inflight && !force) return inflight;
  inflight = fetch('/api/brand-kits').then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
    .then((b) => { const kits = ((b.items ?? []) as BrandKit[]).map(normalizeKit); registerBrandFonts(kits); set({ kits, activeId: b.activeId ?? '', fonts: b.fonts ?? [], loaded: true, error: null }); })
    .catch((e) => set({ loaded: true, error: String(e?.message ?? e) })).finally(() => { inflight = null; });
  return inflight;
}
export const brandState = () => st;
/** Re-render on any change; loads once. */
export function useBrand(): BrandState {
  const [, tick] = useState(0);
  useEffect(() => { const f = () => tick((n) => n + 1); subs.add(f); if (!st.loaded) loadBrandKits(); return () => { subs.delete(f); }; }, []);
  return st;
}
export const activeKit = (s: BrandState = st): BrandKit | undefined => s.kits.find((k) => k.id === s.activeId) ?? s.kits[0];
export function setBrandOn(m: BrandMediaKind, on: boolean) { try { localStorage.setItem(LS(m), on ? '1' : '0'); } catch { /* storage off */ } set({ on: { ...st.on, [m]: on } }); }
/** The logo apps' "Use brand colours" switch (per browser, shared by Product Shot, Phone Photo and UGC Ad). */
export function setBrandColours(on: boolean) { try { localStorage.setItem(LS_COLOURS, on ? '1' : '0'); } catch { /* storage off */ } set({ colours: on }); }
export async function setActiveKit(id: string) {
  const prev = st.activeId; set({ activeId: id });
  const r = await fetch('/api/brand-kits/active', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id }) }).catch(() => null);
  if (!r?.ok) { set({ activeId: prev }); throw new Error('Couldn’t switch brands. Try again.'); }
}
/** Replace one kit after a save (or drop it: null). */
export function putKit(k: BrandKit | null, id?: string, activeId?: string) {
  if (k) { k = normalizeKit(k); registerBrandFonts([k]); }
  const kits = k ? (st.kits.some((x) => x.id === k.id) ? st.kits.map((x) => (x.id === k.id ? k : x)) : [...st.kits, k]) : st.kits.filter((x) => x.id !== id);
  set({ kits, ...(activeId ? { activeId } : {}) });
}
/** Mode from a form's types field ('["music"]', 'music'). */
export const modeOfTypes = (types: unknown): string | null => { const s = String(types ?? ''); if (!s) return null; try { const t = JSON.parse(s); return Array.isArray(t) ? (t[0] != null ? String(t[0]) : null) : String(t); } catch { return s; } };
/** The kit id to send with a run of this tool (brandKit field), or null when Brand is off, not used by this tool, or there is no kit. */
export function brandKitFor(toolId: string, mode?: string | null): string | null {
  const m = brandMediaFor(toolId, mode ?? null); if (!m || !st.on[m]) return null; return activeKit()?.id ?? null;
}
/** Add brandKit to a submit form (FormData) when Brand is on for its tool; one call in every submit path. */
export function addBrandField(toolId: string, fd: FormData) {
  if (fd.has('brandKit')) return; const id = brandKitFor(toolId, String(fd.get('mode') ?? '') || modeOfTypes(fd.get('types'))); if (id) fd.append('brandKit', id);
  if (id && st.colours && brandAccentLead(toolId) && !fd.has('brandColours')) fd.append('brandColours', '1');
}
/** The same for the prompt peek's JSON fields. */
export function withBrandFields(toolId: string, fields: Record<string, string>): Record<string, string> {
  if (fields.brandKit) return fields; const id = brandKitFor(toolId, fields.mode || modeOfTypes(fields.types)); if (!id) return fields;
  return { ...fields, brandKit: id, ...(st.colours && brandAccentLead(toolId) ? { brandColours: '1' } : {}) };
}
/** Recreate: the job ran with a kit → Brand on with that kit (if it still exists); without one → Brand off for that tool's media. → a note to show, or null. */
export async function brandFromRecreate(toolId: string, form: Record<string, string>): Promise<string | null> {
  const m = brandMediaFor(toolId, form.mode || modeOfTypes(form.types)); if (!m) return null;
  if (!form.brandKit) { if (st.on[m]) setBrandOn(m, false); return null; }
  if (!st.loaded) await loadBrandKits();
  const k = st.kits.find((x) => x.id === form.brandKit);
  if (!k) { setBrandOn(m, false); return 'That run used a brand you’ve since deleted, so Brand is off.'; }
  if (st.activeId !== k.id) await setActiveKit(k.id).catch(() => undefined);
  if (brandAccentLead(toolId)) setBrandColours(form.brandColours === '1'); setBrandOn(m, true); return null;
}
