/**
 * Native ComfyUI client (the HTTP + websocket API every local ComfyUI serves):
 *   POST /upload/image (multipart; ComfyUI stores any file type in input/, used for videos too)
 *   POST /prompt {prompt, client_id} → {prompt_id}      GET /history/{id} → outputs
 *   GET  /view?filename&subfolder&type → bytes          WS /ws?clientId= → executing / progress / executed
 * Used when OPENHIGGSFIELD_COMFY_API=native (default when COMFY_BASE_URL is a local / private host).
 * The Comfy API v2 SDK path (comfyClient.ts) stays for Comfy Cloud / *.run.comfy.app.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import WebSocket from 'ws';
import { parseComfyBinary } from './preview.js';

export interface NativeOutput { filename: string; subfolder: string; type: string; kind: 'images' | 'videos' | 'audio' | 'gifs' | string }
/** percent is real only when `known` is true: sampler steps (step / max across the graph's sampler nodes). Before the first sampler step
 *  (model load, text encode) nothing honest can be said about how far along the render is, so known = false and percent stays 0. */
/** Per-run wall-clock marks (ms since epoch) for step-ETA learning (stepEta.ts). startedAt = ComfyUI execution_start; firstStepAt / lastStepAt = the
 *  first / last sampler progress event; doneAt = executing node:null (else when /history showed the outputs); steps = sampler steps run (sum of each
 *  sampler node's max); cachedNodes = node ids ComfyUI reported in execution_cached (loaders there = the model was already loaded). */
export interface NativeTiming { submittedAt: number; startedAt: number | null; firstStepAt: number | null; lastStepAt: number | null; doneAt: number; steps: number; cachedNodes: string[] }
/** phase (shared progress, progress.ts): queued = submitted, waiting in ComfyUI's own queue (queuePos = place among ComfyUI's pending prompts, 1 = next);
 *  loading = our prompt started, no sampler step yet (model load, text encode); generating = sampler steps; finishing = every sampler done (VAE decode, save). */
export interface NativeProgress { node: string | null; value: number; max: number; done: number; total: number; percent: number; known?: boolean; steps?: { value: number; max: number; sampler: number; samplers: number } | null;
  phase?: 'queued' | 'loading' | 'generating' | 'finishing'; queuePos?: number | null }
/** A preview frame from ComfyUI's websocket (comfy/preview.ts parseComfyBinary). */
export interface NativePreview { mime: 'image/jpeg' | 'image/png'; data: Buffer; nodeId: string | null; promptId: string | null }
/** Our prompt's place among ComfyUI's PENDING prompts (1 = next to start), from GET /queue entries [number, prompt_id, …]; null when not pending. */
export function comfyQueuePosition(q: { queue_running?: any[]; queue_pending?: any[] }, id: string): number | null {
  const num = (e: any) => (Array.isArray(e) ? Number(e[0]) : Number(e?.number)); const pidOf = (e: any) => (Array.isArray(e) ? e[1] : e?.prompt_id);
  const pend = q.queue_pending ?? []; const mine = pend.find((e) => pidOf(e) === id); if (!mine) return null;
  return 1 + pend.filter((e) => pidOf(e) !== id && num(e) < num(mine)).length;
}
/** Sampler-like nodes (KSampler, KSamplerAdvanced, SamplerCustom(Advanced), …): where ComfyUI spends the render time and reports steps. */
export const isSamplerNode = (n: any) => /sampler/i.test(String(n?.class_type ?? '')) && !/^(KSamplerSelect|SamplerSelect|.*SamplerSelect)$/i.test(String(n?.class_type ?? ''));
/** Real percent from steps: samplers finished plus the current sampler's step fraction, over the graph's sampler count. */
export function stepPercent(samplersDone: number, value: number, max: number, samplers: number) {
  const s = Math.max(1, samplers); return Math.max(0, Math.min(99, Math.floor(((Math.min(samplersDone, s) + (max > 0 ? Math.min(1, value / max) : 0)) / s) * 100)));
}

/** What cancelPrompt did: removed from ComfyUI's pending queue, interrupted while running, not in ComfyUI's queue any more (finished), or ComfyUI unreachable. */
export type CancelOutcome = 'removed' | 'interrupted' | 'not_in_queue' | 'unreachable';
const cancels = new Map<string, Promise<CancelOutcome>>();
/** A run we gave up on: 'stall' = no progress for the stall window while running, 'cap' = past the hard cap on running time.
 *  cancel = what cancelPrompt did with OUR prompt (never anyone else's); when it wasn't stopped ('not_in_queue' / 'unreachable') ComfyUI may still finish it,
 *  and the late-result sweeper (comfy/lateRescue.ts) collects it. */
export class ComfyTimeoutError extends Error {
  constructor(readonly kind: 'stall' | 'cap', readonly limitMs: number, readonly promptId: string, readonly cancel: CancelOutcome) {
    super(kind === 'stall' ? `ComfyUI prompt ${promptId}: no progress for ${Math.round(limitMs / 60_000)} min (${cancel})` : `ComfyUI prompt ${promptId} ran longer than ${Math.round(limitMs / 60_000)} min (${cancel})`);
  }
  get minutes() { return Math.max(1, Math.round(this.limitMs / 60_000)); }
}
/** Default stall window (no progress at all while our prompt runs): OPENHIGGSFIELD_COMFY_STALL_MS, else 10 min. */
export const DEFAULT_STALL_MS = () => Number(process.env.OPENHIGGSFIELD_COMFY_STALL_MS) || 10 * 60_000;

export class ComfyNative {
  readonly clientId = randomUUID();
  constructor(readonly base: string, readonly headers: Record<string, string> = {}) { this.base = base.replace(/\/+$/, ''); }

  private async req(p: string, init: RequestInit = {}) {
    const r = await fetch(this.base + p, { ...init, headers: { ...this.headers, ...(init.headers as any) } });
    if (!r.ok) { const t = await r.text().catch(() => ''); throw new Error(`ComfyUI ${init.method ?? 'GET'} ${p} → ${r.status}${t ? `: ${t.slice(0, 600)}` : ''}`); }
    return r;
  }
  async objectInfo(): Promise<Record<string, any>> { return (await this.req('/object_info')).json(); }
  /** Upload a local file into ComfyUI's input dir; returns the name to put in LoadImage/LoadVideo inputs. */
  async upload(file: string, name = `oh_${randomUUID().slice(0, 8)}_${path.basename(file)}`): Promise<string> {
    const fd = new FormData();
    fd.append('image', new Blob([await readFile(file)]), name); fd.append('overwrite', 'true'); fd.append('type', 'input');
    const j = await (await this.req('/upload/image', { method: 'POST', body: fd })).json() as { name: string; subfolder?: string };
    return j.subfolder ? `${j.subfolder}/${j.name}` : j.name;
  }
  async submit(prompt: Record<string, any>, extraData?: Record<string, any> | null): Promise<string> {
    const r = await this.req('/prompt', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt, client_id: this.clientId, ...(extraData ? { extra_data: extraData } : {}) }) });
    const j = await r.json() as { prompt_id?: string; error?: any; node_errors?: any };
    if (!j.prompt_id) throw new Error(`ComfyUI rejected the graph: ${JSON.stringify(j.error ?? j.node_errors ?? j).slice(0, 800)}`);
    return j.prompt_id;
  }
  async history(id: string): Promise<any | null> { const j = await (await this.req(`/history/${encodeURIComponent(id)}`)).json() as Record<string, any>; return j[id] ?? null; }
  /**
   * Cancel ONE prompt without touching anyone else's (other apps and people share this ComfyUI):
   *   still pending in ComfyUI's queue → removed (POST /queue {delete:[id]});
   *   running → interrupted, but only after GET /queue shows THIS prompt in queue_running, and with {prompt_id} in the body so a current
   *   ComfyUI interrupts only that prompt even if another one started in between (older ComfyUIs ignore the body; the check above still holds);
   *   neither → it already finished (or was never queued): nothing is touched.
   * One cancel per prompt: concurrent / repeated calls (the cancel route and the runner's poll loop) share the first call's answer.
   */
  cancelPrompt(id: string): Promise<CancelOutcome> {
    const key = `${this.base}#${id}`; const cur = cancels.get(key); if (cur) return cur;
    const p = this.cancelOnce(id); cancels.set(key, p); setTimeout(() => cancels.delete(key), 60_000).unref?.(); return p;
  }
  private async cancelOnce(id: string): Promise<CancelOutcome> {
    const queue = async () => (await this.req('/queue')).json() as Promise<{ queue_running?: any[]; queue_pending?: any[] }>;
    const has = (xs?: any[]) => (xs ?? []).some((e) => (Array.isArray(e) ? e[1] : e?.prompt_id) === id);
    const interrupt = async () => { await this.req('/interrupt', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt_id: id }) }); return 'interrupted' as const; };
    try {
      const q = await queue();
      if (has(q.queue_pending)) {
        await this.req('/queue', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ delete: [id] }) });
        const after = await queue().catch(() => null); // it may have started between the read and the delete: then it is ours and running
        return after && has(after.queue_running) ? interrupt() : 'removed';
      }
      if (has(q.queue_running)) return interrupt();
      return 'not_in_queue';
    } catch { return 'unreachable'; } // ComfyUI unreachable: nothing to stop
  }
  async download(o: NativeOutput, dest: string) {
    const q = new URLSearchParams({ filename: o.filename, subfolder: o.subfolder ?? '', type: o.type ?? 'output' });
    await writeFile(dest, Buffer.from(await (await this.req(`/view?${q}`)).arrayBuffer()));
    return dest;
  }

  /**
   * Run one graph to completion. Progress: websocket `progress` events on sampler nodes give real step / max (stepPercent);
   * before the first step, known = false (no percent). /history polling (with backoff) is authoritative so a dropped socket can't hang a job.
   * Giving up (both clocks start when our prompt starts executing, never at submit: ComfyUI's queue wait never counts):
   *   stall: no progress for stallMs (any websocket event about our prompt: execution_start / executing / progress / executed / cached, a preview
   *          frame, or a change in o.activity(), e.g. model bytes moving). Without a live socket nothing can be observed, so only the cap applies then
   *          (the socket reconnects by itself; a reconnect starts a fresh window).
   *   cap:   running longer than timeoutMs (hard cap; default 60 min).
   * Either way the last /history look still collects a finished result; otherwise OUR prompt is cancelled (cancelPrompt: interrupt only when it is
   * ours and running, else removed from the pending queue) and a ComfyTimeoutError says what was done.
   */
  async run(prompt: Record<string, any>, o: { onProgress?: (p: NativeProgress) => void; onSubmitted?: (id: string) => void; isCanceled?: () => boolean; timeoutMs?: number;
    /** No-progress window while running (default DEFAULT_STALL_MS). */ stallMs?: number;
    /** Extra progress signal: any change in this value counts as progress (e.g. model-load bytes). */ activity?: () => unknown;
    /** Live sampler previews (binary websocket frames) of THIS prompt; previewMethod = extra_data.preview_method for this prompt only (comfy/preview.ts). */
    onPreview?: (f: NativePreview) => void; previewMethod?: string | null } = {}): Promise<{ promptId: string; outputs: Record<string, NativeOutput[]>; timing?: NativeTiming }> {
    const total = Object.keys(prompt).length; const seen = new Set<string>(); let cur: string | null = null; let pid = '';
    // Progress = sampler steps only. The old node-count percent jumped to ~50% within seconds (loaders + text encoders are half the
    // nodes of a txt2img graph but take no time), so it is gone: until the first step arrives the job reports known:false (indeterminate).
    const samplerIds = Object.entries(prompt).filter(([, n]) => isSamplerNode(n)).map(([id]) => id); const samplers = samplerIds.length;
    const doneSamplers = new Set<string>(); let steps: NativeProgress['steps'] = null; let lastPct = 0;
    const tm = { submittedAt: 0, startedAt: null as number | null, firstStepAt: null as number | null, lastStepAt: null as number | null, wsDoneAt: null as number | null, cached: [] as string[], maxBySampler: new Map<string, number>() };
    const phaseOf = (isStepNode: boolean, max: number): NativeProgress['phase'] => !tm.startedAt ? 'queued' : !steps ? 'loading'
      : isStepNode && max > 0 ? 'generating' : samplers > 0 && doneSamplers.size >= samplers ? 'finishing' : 'generating';
    const emit = (value = 0, max = 0) => {
      const isStepNode = !!cur && (samplers === 0 || samplerIds.includes(cur));
      if (isStepNode && max > 0) steps = { value, max, sampler: Math.min(doneSamplers.size + 1, Math.max(1, samplers)), samplers: Math.max(1, samplers) };
      const known = !!steps; if (known) lastPct = Math.max(lastPct, isStepNode && max > 0 ? stepPercent(doneSamplers.size, value, max, samplers || 1) : stepPercent(doneSamplers.size, 0, 0, samplers || 1));
      o.onProgress?.({ node: cur, value, max, done: seen.size, total, known, steps, percent: known ? lastPct : 0, phase: phaseOf(isStepNode, max), queuePos: null });
    };
    let ws: WebSocket | null = null; let wsDone = false; let wsError: string | null = null; let wsAlive = false; let ended = false;
    let lastAct = 0; const bump = () => { lastAct = Date.now(); };
    const OURS = new Set(['execution_start', 'execution_cached', 'executing', 'progress', 'executed', 'progress_state', 'execution_success']);
    const onMessage = (raw: WebSocket.RawData, isBinary: boolean) => {
        if (isBinary) { // previews: ComfyUI sends them only to the client that queued the running prompt (our clientId is per run)
          if (tm.startedAt) bump();
          if (!o.onPreview || !tm.startedAt) return; const b = parseComfyBinary(raw as Buffer);
          if (b?.kind === 'preview' && (!b.promptId || !pid || b.promptId === pid)) o.onPreview({ mime: b.mime, data: b.data, nodeId: b.nodeId, promptId: b.promptId }); return; }
        let m: any; try { m = JSON.parse(String(raw)); } catch { return; }
        const d = m.data ?? {}; if (pid && d.prompt_id && d.prompt_id !== pid) return;
        if (OURS.has(m.type)) bump(); // any event about our prompt (or an untagged one on our per-run socket) = progress
        if (m.type === 'execution_start') { tm.startedAt ??= Date.now(); emit(); } // out of ComfyUI's queue: loading
        if (m.type === 'execution_cached') for (const n of d.nodes ?? []) { seen.add(String(n)); tm.cached.push(String(n)); }
        if (m.type === 'executing') { if (cur) { seen.add(cur); if (samplerIds.includes(cur) && steps) doneSamplers.add(cur); } cur = d.node == null ? null : String(d.node); if (d.node == null && d.prompt_id === pid) { wsDone = true; tm.wsDoneAt ??= Date.now(); } emit(); }
        if (m.type === 'progress') { if (d.node != null) cur = String(d.node);
          if (cur && (samplers === 0 || samplerIds.includes(cur)) && Number(d.max) > 0) { const t = Date.now(); tm.firstStepAt ??= t; tm.lastStepAt = t; tm.maxBySampler.set(cur, Math.max(tm.maxBySampler.get(cur) ?? 0, Number(d.max) || 0)); }
          emit(Number(d.value) || 0, Number(d.max) || 0); }
        if (m.type === 'executed' && d.node != null) { seen.add(String(d.node)); if (samplerIds.includes(String(d.node))) doneSamplers.add(String(d.node)); emit(); }
        if (m.type === 'execution_error') wsError = `${d.node_type ?? 'node'} ${d.node_id ?? ''}: ${d.exception_message ?? 'error'}`;
    };
    /** Open the socket (again after a drop: same clientId, so ComfyUI keeps sending our prompt's events). Resolves once open, failed or after 3 s. */
    const connect = async () => {
      try {
        const s = new WebSocket(`${this.base.replace(/^http/, 'ws')}/ws?clientId=${this.clientId}`, { headers: this.headers }); ws = s;
        s.on('message', onMessage); s.on('error', () => undefined);
        s.on('open', () => { wsAlive = true; bump(); }); // a (re)connect starts a fresh stall window: events while it was down were not seen
        s.on('close', () => { if (ws === s) wsAlive = false; if (!ended && ws === s) setTimeout(() => { if (!ended && ws === s) void connect(); }, 5000).unref?.(); });
        await new Promise<void>((res) => { s.once('open', () => res()); s.once('error', () => res()); setTimeout(res, 3000); });
      } catch { /* no socket: /history polling still finishes the run */ }
    };
    await connect(); const hadSocket = wsAlive;
    const collect = (h: any) => {
      const outputs: Record<string, NativeOutput[]> = {};
      for (const [node, v] of Object.entries<any>(h.outputs ?? {})) for (const kind of Object.keys(v)) if (Array.isArray(v[kind])) for (const f of v[kind]) { if (f?.filename) (outputs[node] ??= []).push({ ...f, kind }); else if (kind === 'text' && typeof f === 'string') (outputs[node] ??= []).push({ filename: '', subfolder: '', type: 'text', kind, text: f } as any); }
      o.onProgress?.({ node: null, value: 1, max: 1, done: total, total, percent: 100, known: true, steps, phase: 'finishing', queuePos: null });
      const timing: NativeTiming = { submittedAt: tm.submittedAt, startedAt: tm.startedAt, firstStepAt: tm.firstStepAt, lastStepAt: tm.lastStepAt, doneAt: tm.wsDoneAt ?? Date.now(),
        steps: [...tm.maxBySampler.values()].reduce((a, b) => a + b, 0), cachedNodes: tm.cached };
      return { promptId: pid, outputs, timing };
    };
    const finished = (h: any) => !!h && (h.status?.completed || Object.keys(h.outputs ?? {}).length > 0);
    try {
      tm.submittedAt = Date.now(); pid = await this.submit(prompt, o.previewMethod ? { preview_method: o.previewMethod } : null); o.onSubmitted?.(pid);
      // The timeout clock starts when OUR prompt starts executing (execution_start on the socket, or GET /queue shows it running), never at submit:
      // time spent waiting in ComfyUI's shared queue behind other prompts doesn't count (that wait can be cancelled instead).
      let execT0: number | null = null; let delay = 250; let lastQueueAt = 0; let goneSince: number | null = null;
      const limit = o.timeoutMs ?? 60 * 60_000; const stallMs = o.stallMs ?? DEFAULT_STALL_MS(); const GONE_MS = Number(process.env.OPENHIGGSFIELD_COMFY_GONE_MS) || 30_000;
      let actSig = JSON.stringify(o.activity?.() ?? null); let runQAt = 0; let runGoneSince: number | null = null;
      if (!tm.startedAt) o.onProgress?.({ node: null, value: 0, max: 0, done: 0, total, percent: 0, known: false, steps: null, phase: 'queued', queuePos: null });
      for (;;) {
        if (tm.startedAt) execT0 ??= tm.startedAt;
        // not started yet: our place among ComfyUI's pending prompts (e.g. behind someone else's batch), read at most every 3 s (also without a socket)
        if (execT0 == null && Date.now() - lastQueueAt > 3000) { lastQueueAt = Date.now();
          const q = await this.req('/queue').then((r) => r.json() as any).catch(() => null);
          if (q && execT0 == null && !tm.startedAt) { const pos = comfyQueuePosition(q, pid); const running = (q.queue_running ?? []).some((e: any) => (Array.isArray(e) ? e[1] : e?.prompt_id) === pid);
            if (pos != null) { goneSince = null; o.onProgress?.({ node: null, value: 0, max: 0, done: 0, total, percent: 0, known: false, steps: null, phase: 'queued', queuePos: pos }); }
            else if (running) { goneSince = null; execT0 = Date.now(); }
            else goneSince ??= Date.now(); } } // neither pending nor running: finished (history says so below) or lost (ComfyUI restarted)
        // started: every 10 s (or GONE_MS / 3), is our prompt still in ComfyUI's queue? (gone = ComfyUI restarted; the history check below wins if it finished)
        if (execT0 != null && Date.now() - runQAt > Math.min(10_000, GONE_MS / 3)) { runQAt = Date.now();
          const q = await this.req('/queue').then((r) => r.json() as any).catch(() => null);
          if (q) { const has = (xs?: any[]) => (xs ?? []).some((e: any) => (Array.isArray(e) ? e[1] : e?.prompt_id) === pid);
            if (has(q.queue_running) || has(q.queue_pending)) runGoneSince = null; else runGoneSince ??= Date.now(); } }
        if (o.activity) { const a = JSON.stringify(o.activity() ?? null); if (a !== actSig) { actSig = a; bump(); } }
        if (execT0 != null && !wsAlive) bump(); // no socket: progress can't be seen, so only the hard cap applies (a reconnect starts a fresh window)
        if (o.isCanceled?.()) { await this.cancelPrompt(pid); throw new Error('canceled'); }
        if (wsError) throw new Error(`ComfyUI execution error: ${wsError}`);
        const h = await this.history(pid).catch(() => null);
        if (h?.status?.status_str === 'error') throw new Error(`ComfyUI execution error: ${JSON.stringify(h.status.messages ?? '').slice(0, 600)}`);
        if (finished(h) && (wsDone || !hadSocket || h.status?.completed)) return collect(h);
        const gone = execT0 == null ? goneSince : runGoneSince;
        if (gone != null && !h && Date.now() - gone > GONE_MS) throw new Error(`ComfyUI no longer has prompt ${pid} (not queued, not running, no result; was ComfyUI restarted?)`);
        const now = Date.now(); const capHit = execT0 != null && now - execT0 > limit; const stallHit = execT0 != null && wsAlive && now - Math.max(execT0, lastAct) > stallMs;
        if (capHit || stallHit) { // one last look before failing: a finished result is still collected
          const last = await this.history(pid).catch(() => null); if (finished(last) && last?.status?.status_str !== 'error') return collect(last);
          if (last?.status?.status_str === 'error') throw new Error(`ComfyUI execution error: ${JSON.stringify(last.status.messages ?? '').slice(0, 600)}`);
          const cancel = await this.cancelPrompt(pid); // ours only: interrupt when ComfyUI says OUR prompt is running, else delete it from the pending queue
          const err = new ComfyTimeoutError(capHit ? 'cap' : 'stall', capHit ? limit : stallMs, pid, cancel);
          console.warn(`[openhiggsfield] ${err.message}: ${cancel === 'interrupted' ? 'interrupted our running prompt' : cancel === 'removed' ? 'removed our prompt from ComfyUI\'s queue' : cancel === 'not_in_queue' ? 'not in ComfyUI\'s queue any more (nothing touched)' : 'ComfyUI unreachable (nothing touched)'}`);
          throw err; }
        let w = 0; do { await new Promise((r) => setTimeout(r, 50)); w += 50; } while (w < delay && !(wsDone || wsError) && !o.isCanceled?.()); // wake as soon as the socket says it's done (outputs collected without the backoff wait)
        delay = Math.min(3000, Math.round(delay * 1.5));
      }
    } finally { ended = true; try { (ws as WebSocket | null)?.close(); } catch {} }
  }
}
