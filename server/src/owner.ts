/**
 * B7: job ownership for a single-user, no-auth install.
 * - Every request is the local user (there is no login or session on this server; X-Client-Id is a per-browser tag, not an identity).
 * - New jobs get `owner` = callerOwner(req) when they are created (routesPrefill.ts onResponse hook; no change to createJob).
 * - Jobs saved before B7 have no `owner`: ownerOf() backfills them to the local owner at read time (no DB migration).
 * - Seeded / community-imported items get another owner (job.owner = 'community:<name>', or job_meta.author ≠ 'you'), so isOwner is false.
 * Responses carry owner + isOwner (relative to the caller) on GET /api/jobs, /api/jobs/:id, /api/share/:token, /api/community and /api/community/shots.
 */
import type { FastifyRequest } from 'fastify';
import * as lib from './library.js';

export const LOCAL_OWNER = String(process.env.OPENHIGGSFIELD_OWNER || 'local').replace(/[^\w.:-]/g, '').slice(0, 64) || 'local';
/** Owner of the built-in Community examples (seed content shipped with the app). */
export const SEED_OWNER = 'community:openhiggsfield';
/** The caller's identity: always the local user on this single-user server. */
export const callerOwner = (_req?: FastifyRequest) => LOCAL_OWNER;
/** Stored owner, else the community author for imported items, else the local owner (read-time backfill). */
export function ownerOf(j: { id: string; owner?: unknown } | undefined | null): string {
  if (!j) return LOCAL_OWNER;
  if (typeof j.owner === 'string' && j.owner) return j.owner;
  const author = (lib.metaOf(j.id) as any)?.author;
  return typeof author === 'string' && author && author !== 'you' ? `community:${author}` : LOCAL_OWNER;
}
/** A run that counts in your totals (stats, run counts, popularity): not a seeded sample and not one of the app's examples (featuredSeed.ts, $0). */
export const countsAsRun = (j: unknown) => !!j && !(j as any).seed && typeof (j as any).featuredExample !== 'string';
export const ownerFields =(owner: string, req?: FastifyRequest) => ({ owner, isOwner: owner === callerOwner(req) });
