/**
 * legacy: today's whole server (legacy.ts: routes, queue, tools, listen) as one plugin. Later phases move pieces out of it into their own
 * plugins until it is empty (plan §7). It starts last, after every place is registered, so a job picked up at start finds its place.
 * It takes the server from ctx.http (legacy.ts adds its routes and hooks to it and listens at the end) and closes it when disposed.
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
