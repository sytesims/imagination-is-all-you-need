/**
 * legacy: the server core (legacy.ts: security, CORS, uploads, /files/, the job and library routes, the queue) as one plugin. Phase 5 moved the
 * route groups out into feature plugins (plugins-builtin/features.ts); what is left is listed in legacy.ts. It starts after every place and tool
 * is registered, so a job picked up at start finds its place; the feature plugins mount after it, then boot.ts starts listening (listen()).
 * It takes the server from ctx.http (legacy.ts adds its routes and hooks to it) and closes it when disposed.
 * Keys: every key ('*'), until its code moves into plugins that declare their own.
 */
import { definePlugin } from '../kernel/index.js';

export default definePlugin({
  name: 'legacy', inject: ['places', 'http', 'settings', 'db', 'keys'], keys: '*',
  async apply(ctx) {
    const http = ctx.http.server; const prev = http.owner; http.owner = 'legacy'; // routes and hooks legacy.ts adds with plain app.* calls are legacy's
    let app; try { ({ app } = await import('../legacy.js')); } finally { http.owner = prev; }
    if (app !== http.app) throw new Error('legacy: legacy.ts must use the kernel server (ctx.http)');
    ctx.effect(() => () => http.close(), 'close the server');
  },
});
