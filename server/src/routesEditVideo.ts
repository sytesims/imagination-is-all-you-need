import { VUP_TOOLS, vupSizing } from './shared/videoUpscale.js';
import { toolDefaults } from './routing/defaults.js';
import type { FastifyInstance } from 'fastify';
import { getTool } from './tools/registry.js';
import { EDIT_VIDEO_MENU, EDIT_VIDEO_LIMITS } from './tools/editVideo/index.js';
import { routesFor } from './routing/routes.js';
import { keyMissing, keyOwner, routeInput } from './routing/select.js';
import { aKey } from './shared/modelIds.js';
import { resolveDuration, hasToolDurations, defaultDurationFor } from './tools/h3/videoCaps.js';
import { durToolOf } from './tools/apps.js';
import { reasonSentence, notWiredSentence, NOT_WIRED_REASON, LOCAL_OFF_REASON, LOCAL_OFF_DETAIL } from './routing/runnable.js';
import { priceLine, demoPriceLine, listedRoutes } from './routing/http.js';
import type { RouteOption } from './routing/types.js';
import { HOSTED_BY_ID } from './shared/hostedPrices.js';
import { DEFAULT_DURATION, upscaleOutputSize } from './shared/pricing.js';
import { withArticle } from './shared/userText.js';
import { ledgerUsd } from './shared/priceText.js';

/** GET /api/edit-video/tools[?seconds=8&resolution=1080p&sourceResolution=720p] → the Edit Video menu: per tool {id, name, existed, limits, inputs, models[{id, routes[{routeId, kind, credits, priceSource, available, reason}]}]}.
 *  Prices use the same option()/priceOf as the job charge (quote = charge); quote a specific job with GET /api/tools/:id/price. */
/** Steering (Oct 18): per-route price fields with the values GET /api/tools/:id/price?provider=&route= gives for that route, so the menu needs no quote per tile.
 *  demo → credits 0 + listCredits; runnable → credits = charge; key missing → credits = price once the key is added (needsKey, not a charge);
 *  any other reason → credits null, listCredits = list price, priceLine says why. */
function routeQuote(o: any, envKey: string | null | undefined, demo: boolean) {
  const usd = (c: number) => ledgerUsd(c); const list: number | null = demo ? o.listCredits ?? o.credits : o.credits;
  if (demo) return { credits: 0, listCredits: list, chargeable: false, priceLine: demoPriceLine(list) };
  if (o.available) return { credits: list, listCredits: list, chargeable: (list ?? 0) > 0, priceLine: priceLine(o.kind, list, false) };
  if (keyMissing(o)) return { credits: list, listCredits: list, chargeable: false, priceLine: list != null ? `Needs ${aKey(keyOwner(envKey))}. Price once it's added: ≈ ${usd(list)}.` : `Needs ${aKey(keyOwner(envKey))}.` };
  if (o.reasonCode === 'local_off') return { credits: null, listCredits: list, chargeable: false, priceLine: `${reasonSentence(LOCAL_OFF_REASON)} Free once it's on.` }; // Oct 19 #3: off = not runnable
  const why = o.reason === NOT_WIRED_REASON ? notWiredSentence(o.label) : `${o.label} can't run this job. ${reasonSentence(o.reason ?? '')}`.trim();
  if (o.reasonCode === 'input_blocked' && list != null) return { credits: list, listCredits: list, chargeable: false, priceLine: priceLine(o.kind, list, false), blockedReason: why }; // Oct 19 #8 (same as the quote)
  return { credits: null, listCredits: list, chargeable: false, priceLine: `${why}${list != null && list > 0 ? ` List price ≈ ${usd(list)}.` : ''}` };
}
/** Oct 18 #9 + Oct 19 #3: tool-level state from the SAME per-route availability as /api/routes (listedRoutes): available = some route runs now; else a demo
 *  preview (mock backend); else what unlocks it ("Needs a fal key." / Use local ComfyUI), never a placeholder row's note. */
function menuState(models: any[][]) {
  const all = models.flat(); if (all.some((o) => o.available)) return { available: true, needsKey: false, reason: null, reasonDetail: null };
  if (all.some((o) => o.demo)) { const owners = [...new Set(all.filter((o) => o.demo).map((o) => keyOwner(o.envKey)))]; return { available: true, needsKey: true, demo: true, reason: null, reasonDetail: `Makes sample output here. Real runs need a ${owners.join(' or ')} key in Settings.` }; }
  const km = all.filter((o) => keyMissing(o) && o.credits != null); const owners = [...new Set(km.map((o) => keyOwner(o.envKey)))];
  if (owners.length) { const o = owners.length > 1 ? `${owners.slice(0, -1).join(', ')} or ${owners[owners.length - 1]}` : owners[0]; return { available: false, needsKey: true, keyOwners: owners, reason: `Needs a ${o} key.`, reasonDetail: `Available once a ${o} key is added in Settings.` }; }
  if (all.some((o) => o.reasonCode === 'local_off')) return { available: false, needsKey: false, reason: reasonSentence(LOCAL_OFF_REASON), reasonDetail: LOCAL_OFF_DETAIL, reasonCode: 'local_off' };
  const first = all.find((o) => o.reason); return { available: false, needsKey: false, reason: first?.reason ? reasonSentence(first.reason) : 'Not ready yet. Pick another model.', reasonDetail: null };
}
export function registerEditVideo(app: FastifyInstance) {
  app.get<{ Querystring: { seconds?: string; resolution?: string; sourceResolution?: string } }>('/api/edit-video/tools', async (req) => {
    // Oct 18 #4: the same assumption as GET /api/tools/:id/price with no clip (DEFAULT_DURATION s, 720p 16:9 source at the default scale), so menu and quote agree.
    const asked = Number(req.query.seconds) || 0; const seconds = asked || DEFAULT_DURATION; const assumed = !asked;
    const srcGiven = /^\d{3,4}p$/i.test(String(req.query.sourceResolution ?? '')); // Oct 18 #8: a given source size is not an assumption
    const rh = Number(String(req.query.sourceResolution ?? '').match(/^(\d{3,4})p$/i)?.[1]) || 720; const rw = Math.round((rh * 16) / 9 / 2) * 2;
    return { estimated: assumed, assumedSeconds: assumed ? seconds : null, estimateMessage: assumed ? `Prices for ${withArticle(seconds)} s clip; the exact price shows once your clip is loaded.` : null,
      tools: EDIT_VIDEO_MENU.map((m) => { const t = getTool(m.id); if (!t) return { ...m, available: false };
      const a: any = (t as any).app; const sc = a?.scales ? a.defaultScale ?? a.scales[0] : null;
      const out = sc ? upscaleOutputSize(rw, rh, sc, (a.outputTargets ? a.outputTargets[Object.keys(a.outputTargets)[0]] : null) ?? a.maxLongSide ?? 3840) : { width: 1920, height: 1080 };
      const input = { duration: seconds, resolution: req.query.resolution || (t.inputs.find((i) => i.name === 'resolution') as any)?.default || '720p', outputSize: { width: out.width, height: out.height }, ...(sc ? { scale: sc, inputSize: { width: rw, height: rh }, types: ['precise'] } : {}) };
      // steering: per model, the same routing input as the quote: the tool's fixed routing fields (routeInput, e.g. h3-extend mode extend) and the ONE duration rule
      // (resolveDuration → the model's own default length when none is asked; else the 8 s assumption), so menu prices = quote prices.
      const durTool = durToolOf(t) ?? t.id; const inputFor = (pid: string) => { const rs = resolveDuration(durTool, pid, asked ? String(asked) : undefined);
        const d = rs && !('error' in rs) ? rs.seconds : hasToolDurations(durTool) ? defaultDurationFor(durTool, pid) ?? seconds : seconds; const res = req.query.resolution || a?.defaultResolutionByProvider?.[pid] || input.resolution; // the model's own default size (LTX-2.5 Extend: 448p), as the quote and the job use
        return routeInput(t, VUP_TOOLS.has(t.id) && sc ? vupSizing(pid, { ...input, resolution: res, duration: d, outputSize: undefined }, { width: rw, height: rh }) : { ...input, resolution: res, duration: d }); }; // Video Upscale: each model's own size rule
      const est = { estimated: assumed || (!!sc && !srcGiven), assumedSeconds: assumed ? seconds : null, ...(sc ? (srcGiven ? { sourceSize: { width: rw, height: rh }, scale: sc, outputSize: { width: out.width, height: out.height } } : { assumedSize: { width: rw, height: rh }, assumedScale: sc, assumedOutputSize: { width: out.width, height: out.height } }) : {}) };
      return { ...m, ...est, name: m.name, toolName: t.name, route: t.route, limits: EDIT_VIDEO_LIMITS[m.id] ?? null, inputs: t.inputs.map((i: any) => ({ name: i.name, kind: i.kind, options: i.options, default: i.default, required: !!i.required })),
        ...(() => { const D = toolDefaults(t); return { defaultModel: D.defaultProvider ?? t.providers[0] ?? null, preferredModel: D.preferredProvider, defaultFallback: D.defaultFallback }; })(), // B6: same default as /api/tools
        ...menuState(t.providers.map((pid) => listedRoutes(t, pid, inputFor(pid)))), // Oct 19 #3: one availability rule with /api/routes and the quote
        models: t.providers.map((pid) => ({ id: pid, ...(inputFor(pid).duration !== seconds ? { seconds: inputFor(pid).duration } : {}), routes: (() => { const L = listedRoutes(t, pid, inputFor(pid)); return routesFor(pid, t).map((r) => { const o = L.find((x: any) => x.routeId === r.routeId)!; const h = r.priceRef ? HOSTED_BY_ID[r.priceRef] : null; const demo = !!o.demo;
          const q = routeQuote(o, r.envKey, demo);
          return { routeId: r.routeId, kind: r.kind, label: r.label, credits: q.credits, listCredits: q.listCredits, chargeable: q.chargeable, creditsFor: `${inputFor(pid).duration} s`, priced: r.priceRef == null || (h?.usd ?? null) != null, priceSourceUrl: h?.sourceUrl ?? null, priceNote: h?.note ?? (r.priceRef ? null : 'local: 0 credits'), estimated: !!h?.estimated || est.estimated, priceEstimated: !!h?.estimated, assumedSeconds: est.assumedSeconds != null ? inputFor(pid).duration : null, envKey: r.envKey, configured: o.configured, available: o.available, reason: o.reason ?? null,
            reasonCode: o.reasonCode ?? null, ...(o.kind === 'local' ? { runsWhenPinned: !!o.runsWhenPinned, ...(o.reasonCode === 'local_off' ? { reasonDetail: o.reasonDetail } : {}) } : {}), needsKey: keyMissing(o) && !demo, demo, runnable: o.available || demo, priceLine: q.priceLine, ...((q as any).blockedReason ? { blockedReason: (q as any).blockedReason } : {}), ...(o.status ? { status: o.status } : {}), ...(keyMissing(o) ? { keyOwner: keyOwner(r.envKey) } : {}), ...(demo ? { keyNeededForRealRuns: true } : {}), caps: r.caps ?? null }; }); })() })) }; }), pricing: '1 credit = $0.01; local = 0; failed runs: credits back to your balance' };
  });
}
