/**
 * The web build (npm start): web/dist served at / so deep links (/api-docs, /tools/…) load directly, and the page for any path that is neither
 * the API nor a file (the not-found handler in legacy.ts asks spaFallback()). Plugin web-static turns both on; off (or no build) → / and deep
 * links answer a plain 404 'Not found'.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';

export const WEB_DIST = (() => { const d = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web/dist'); return existsSync(path.join(d, 'index.html')) ? d : null; })();
let on = false;
/** The web build folder when the page should answer unknown paths (plugin web-static on and a build exists), else null. */
export const spaFallback = (): string | null => (on ? WEB_DIST : null);
export const setSpaFallback = (v: boolean) => { on = v; };
export async function registerWebStatic(app: FastifyInstance) {
  if (WEB_DIST) await app.register((await import('@fastify/static')).default, { root: WEB_DIST, prefix: '/', decorateReply: false, wildcard: false });
}
