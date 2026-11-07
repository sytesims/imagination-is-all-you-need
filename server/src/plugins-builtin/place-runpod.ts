/**
 * place-runpod: routes of kind 'runpod' run our own ComfyUI image workflows (comfy/plans.ts buildPlan, the graphs Your computer runs) on the user's
 * RunPod Serverless endpoint with the official worker-comfyui image (providers/runpod.ts; routes in routing/runpodRoutes.ts).
 * INSTALLABLE ONLY: shipped in the repo but NOT in profiles/desktop.yml, so it is off by default. To use it, add `  - place-runpod` to your profile
 * (above `legacy`), then set your RunPod key and Endpoint ID in Settings → Connections (docs/PROVIDERS-AND-MODELS.md, "Installable place plugins").
 * Key: OPENHIGGSFIELD_RUNPOD_API_KEY (alias RUNPOD_API_KEY). Endpoint ID and the GPU rate are settings (routing/runpodRoutes.ts RunpodSettings).
 * Its routes stay hidden until both the key and the Endpoint ID are set (ready()).
 * Inputs go inline as base64 in the /run body (10 MB cap, checked before sending: nothing is sent or charged over it). V1: Create Image only.
 * Cost: the quote is an estimate (GPU seconds per image × your rate); after the run, RunPod's executionTime × your rate is recorded as the job's
 * actual cost (job.actualCost, the Spend page) and on the attempt (reportedCost), information only: the charge stays the quote, as for every place.
 * Cancel: POST /cancel/{id}. A restart polls a one-pass job again (never re-sent). RunPod bills GPU time even for a failed run (billing.ts 'may-charge').
 */
import { definePlugin } from '../kernel/index.js';
import { PlaceError, type PlaceRunner } from '../services/places.js';
import { liveBackend } from '../routing/keys.js';
import type { KeyReader } from '../kernel/keys.js';
import { RUNPOD_KEYS, runpodEndpoint, runpodSettings, runpodUsd, type RunpodSettings } from '../routing/runpodRoutes.js';
import { RunpodComfy, runpodCancel, RUNPOD_KEY_REFUSED } from '../providers/runpod.js';
import { HANDOFF_POLICY } from '../mediaHandoff.js';

export { RUNPOD_KEYS };
export const RUNPOD_NOT_SET_UP = 'RunPod isn’t set up: add your RunPod key and Endpoint ID in Settings → Connections';

export const runpodPlaceOf = (keys: KeyReader, o: { settings?: () => RunpodSettings; f?: typeof fetch; pollMs?: number } = {}): PlaceRunner => {
  const cfg = o.settings ?? runpodSettings; const endpoint = () => (o.settings ? o.settings().endpointId : runpodEndpoint());
  return {
    kind: 'runpod', label: 'RunPod', remote: 'runpod', keyedOnMock: true,
    /** Both the key and the Endpoint ID: until then its routes are hidden (KEY_GATED_KINDS). */
    ready: (r) => keys.configured(r) && !!endpoint(),
    key: (r) => keys.value(r),
    live: (r) => !!keys.value(r) && !!endpoint() && liveBackend(),
    async attempt(job, _tool, r, attempt, kit) {
      const key = kit.key; const ep = endpoint(); const s = cfg();
      if (!key || !ep) throw new PlaceError(RUNPOD_NOT_SET_UP, 'bad_input', { temporary: false });
      const { buildPlan, hasPlan } = await import('../comfy/plans.js');
      if (!hasPlan(job as any)) throw new PlaceError('This workflow can’t run on RunPod yet. Pick another place', 'bad_input', { temporary: false });
      const rm = kit.resuming?.kind === 'runpod' ? kit.resuming : null; let passes = 0; let pass = 0; let ms = 0;
      const t = new RunpodComfy({ base: s.baseUrl, endpoint: ep, key, f: o.f, pollMs: o.pollMs, resumeId: rm?.id ?? null,
        onExecution: (x) => { ms += x; const usd = runpodUsd(ms, s); // GPU time × your rate: the run's real cost (information only; the charge stays the quote)
          job.actualCost = { usd, units: Math.round(ms / 10) / 100, unitLabel: 'GPU seconds', source: 'runpod:executionTime' }; attempt.reportedCost = { usd, source: 'estimate' }; },
        onWarning: (w) => { const line = `RunPod: ${w}`; if (!(job.warnings ??= []).includes(line)) job.warnings.push(line); } });
      const run = t.run.bind(t);
      t.run = (g, opts = {}) => { const k = pass++;
        if (rm && (passes !== 1 || k !== 0 || rm.output !== 0)) return import('../routing/reattach.js').then((R) => { throw R.cannotPickUp(`a ${passes}-pass workflow`); });
        return run(g, { ...opts, onSubmitted: (id) => { attempt.requestId = id; kit.remember({ kind: 'runpod', id }, k, passes); opts.onSubmitted?.(id); } }); }; // stored at once: a restart only polls it
      const { runNative } = await import('../comfy/runNative.js');
      try { await runNative(job, t, (j, bo) => { const p = buildPlan(j, bo); passes = p.passes.length; return p; }); }
      catch (e) { if (e instanceof PlaceError && e.message === RUNPOD_KEY_REFUSED) { job.reasonCode = 'key_invalid' as any; job.errorType = 'validation' as any; } throw e; }
    },
    resume: (h) => !!h.id,
    async cancel(h, r, f) { const key = keys.value(r); const ep = endpoint(); return key && ep ? runpodCancel(cfg().baseUrl, ep, h.id, key, o.f ?? f) : null; },
    inputs: HANDOFF_POLICY.runpod.accepts,
  };
};

export default definePlugin({ name: 'place-runpod', inject: ['places', 'keys'], keys: RUNPOD_KEYS, apply(ctx) { ctx.places.register(runpodPlaceOf(ctx.keys)); } });
