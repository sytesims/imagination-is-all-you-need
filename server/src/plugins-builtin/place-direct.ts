/**
 * place-direct: the labs' own APIs (providers/direct.ts DirectSpec on route.direct): Black Forest Labs, Google Gemini, OpenAI, BytePlus ModelArk,
 * MiniMax and LTX, each with its own key. One plugin for all of them: they share one runner (build → submit/poll or one sync call → save the
 * file at once, lab links expire in 10 min–24 h), and route kind 'direct' is one place. A lab can become its own plugin later when one needs
 * its own settings (region, workspace).
 * It runs the 'direct' routes that have a lab connection (route.direct). The other 'direct' routes (the fal-hosted Topaz / Bria / Ideogram /
 * TRELLIS apps, Luma Reframe) still run through their tool's own code (providers.ts) and read their key there.
 * Off in the profile → every 'direct' route is hidden and quotes say the maker's API isn't set up.
 */
import { definePlugin } from '../kernel/index.js';
import type { PlaceRunner } from '../services/places.js';
import type { KeyReader } from '../kernel/keys.js';
import { liveBackend } from '../routing/keys.js';

export const DIRECT_KEYS = ['OPENHIGGSFIELD_BFL_API_KEY', 'OPENHIGGSFIELD_GEMINI_API_KEY', 'OPENHIGGSFIELD_OPENAI_API_KEY', 'OPENHIGGSFIELD_ARK_API_KEY', 'OPENHIGGSFIELD_MINIMAX_API_KEY', 'OPENHIGGSFIELD_LTX_API_KEY'];
export const directPlaceOf = (keys: KeyReader): PlaceRunner => ({
  kind: 'direct', label: 'The maker’s API', remote: 'direct',
  handles: (r) => !!r.direct,
  ready: (r) => keys.configured(r),
  key: (r) => keys.value(r),
  live: (r) => !!r.direct && !!keys.value(r) && liveBackend(),
  /** One request per output image (perOutput), one per video / audio job; each output saved right away. */
  async attempt(job, tool, r, attempt, kit) {
    const { routeRequest } = await import('../routing/routeRequest.js'); const { directRun: runDirect, DirectError } = await import('../providers/direct.js');
    if (job.remote?.resuming && (!kit.resuming || !(await import('../routing/reattach.js')).canPickUp(kit.resuming))) throw (await import('../routing/reattach.js')).cannotPickUp('no stored request for it'); // never a new submit in its place
    const d = r.direct!; const key = kit.key!; const n = (d.perOutput ?? r.output === 'image') ? kit.count : 1; const outs: { label: string; url: string }[] = [];
    try {
      for (let k = 0; k < n; k++) {
        const rs = kit.resumeAt(k); // a restart / Retry download: poll the request from before, nothing is built or sent again
        const { body: req, input: subIn } = rs ? { body: { method: 'GET', url: '' } as any, input: job.input } : await routeRequest(job, r, k); const sub = { ...job, input: subIn }; job.stage = 'submitted'; // routing/routeRequest.ts: the rewritten input, the lab's body
        const res = await runDirect(d, req, key, { timeoutMs: kit.timeoutMs, job: sub, resume: rs?.pollUrl ? { id: rs.id, pollUrl: rs.pollUrl } : null, isCanceled: kit.isCanceled,
          onSubmit: (id, pollUrl) => { attempt.requestId = id; (job.requestIds ??= []).push(id); if (pollUrl) kit.remember({ kind: 'direct', id, pollUrl, model: d.provider }, k, n); },
          onStatus: (s) => { job.stage = /^(pending|queued|waiting)$/i.test(s) ? 'submitted' : 'rendering'; },
          onCost: (c) => { const prev = k > 0 && job.actualCost?.source === c.source ? job.actualCost : null; // several outputs: add them up
            job.actualCost = { usd: Math.round(((prev?.usd ?? 0) + c.usd) * 1e4) / 1e4, ...(c.units != null ? { units: (prev?.units ?? 0) + c.units } : {}), ...(c.unitLabel ? { unitLabel: c.unitLabel } : {}), source: c.source }; } });
        job.stage = 'downloading'; outs.push({ label: kit.label(k, n), url: await kit.save(res.outputs[0], k, kit.where) });
      }
    } catch (e) { if (e instanceof DirectError) { job.reasonCode = e.reasonCode as any; job.errorType = e.reasonCode === 'content_blocked' ? 'nsfw' : e.reasonCode === 'provider_credits' ? 'credits' : e.reasonCode === 'input_invalid' ? 'invalid_input' : e.temporary ? 'temporary' : 'provider_outage'; } throw e; }
    job.outputs = outs; job.resultUrl = outs[0].url; job.status = 'done'; job.stage = 'done'; job.progress = 100; job.eta = 0;
    if (tool.id === 'h3-video' && tool.routedPost) await tool.routedPost(job, { live: true }); // our final encode (bitrate / audio off) on direct video runs too
  },
  resume: (h) => !!h.pollUrl, // no cancel: the labs have no cancel call
});

export default definePlugin({ name: 'place-direct', inject: ['places', 'keys'], keys: DIRECT_KEYS, apply(ctx) { ctx.places.register(directPlaceOf(ctx.keys)); } });
