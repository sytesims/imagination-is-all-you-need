/**
 * legacy: today's whole server (legacy.ts: routes, queue, tools, listen) as one plugin, unchanged. Later phases move pieces out of it into
 * their own plugins until it is empty (plan §7). It starts last, after every place is registered, so a job picked up at start finds its place.
 */
import { definePlugin } from '../kernel/index.js';

export default definePlugin({ name: 'legacy', inject: ['places'], async apply() { await import('../legacy.js'); } });
