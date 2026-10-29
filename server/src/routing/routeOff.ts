/**
 * Routes Comfy Router refused before running (2026-10-27, live job f609cfc5: FLUX 3 Max text to video got 403 error_type "not_enabled",
 * "Comfy Router is not switched on for this caller yet" for that model). Remembered per route on the server, with the time: the automatic pick
 * skips the route (select.ts option: "Not on Comfy Router yet") and the same model's Comfy Cloud route runs instead. The mark ends after 24 h,
 * on "Check again" (DELETE /api/routing/route-off/:routeId), or on the next successful run there. One kv row; no keys or prompts in it.
 */
import { getKv, setKv } from '../db.js';

const KEY = 'routeOff'; export const ROUTE_OFF_TTL_MS = 24 * 60 * 60 * 1000;
/** The Run on / menu words for a route Comfy Router doesn't run yet. */
export const ROUTE_OFF_REASON = 'Not on Comfy Router yet';
export interface RouteOffMark { code: 'not_enabled'; at: number; model: string | null }
const read = (): Record<string, RouteOffMark> => { try { const v = getKv<Record<string, RouteOffMark>>(KEY, {}); return v && typeof v === 'object' ? v : {}; } catch { return {}; } };
/** The live mark for a route (null = none, or older than 24 h: re-checked by the next run). */
export function routeOff(routeId: string, now = Date.now()): RouteOffMark | null { const m = read()[routeId]; return m && now - m.at < ROUTE_OFF_TTL_MS ? m : null; }
export function markRouteOff(routeId: string, model: string | null = null, now = Date.now()) { const all = read(); all[routeId] = { code: 'not_enabled', at: now, model }; try { setKv(KEY, all); } catch { /* db off: the pick just isn't remembered */ } }
/** Check again / a run that worked there: forget the mark. true = there was one. */
export function clearRouteOff(routeId: string): boolean { const all = read(); if (!all[routeId]) return false; delete all[routeId]; try { setKv(KEY, all); } catch { /* ignore */ } return true; }
/** Every live mark (Settings → Connections → Comfy, GET /api/routing/route-off). */
export function routeOffList(now = Date.now()) { return Object.entries(read()).filter(([, m]) => now - m.at < ROUTE_OFF_TTL_MS).map(([routeId, m]) => ({ routeId, ...m, until: m.at + ROUTE_OFF_TTL_MS })); }
/** GET /api/routing/route-off (the live marks) and DELETE /api/routing/route-off/:routeId ("Check again": the next run there tries Router again;
 *  Comfy has no free probe for one model's switch, so the run itself is the check). */
export function registerRouteOff(app: import('fastify').FastifyInstance) {
  app.get('/api/routing/route-off', async () => ({ routes: routeOffList(), ttlHours: ROUTE_OFF_TTL_MS / 3_600_000, reason: ROUTE_OFF_REASON }));
  app.delete('/api/routing/route-off/:routeId', async (req) => ({ cleared: clearRouteOff(decodeURIComponent(String((req.params as any).routeId ?? ''))), routes: routeOffList() }));
}
