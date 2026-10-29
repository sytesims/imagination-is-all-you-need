/// <reference lib="webworker" />
/**
 * YAMNet in a Web Worker (listenStyle.ts starts it the first time an audio result is played or opened). TensorFlow.js and the model are
 * loaded here, once, on the first request: WebGL (OffscreenCanvas) when the browser has it, else the CPU backend. Each request carries the
 * track's listening windows (16 kHz mono); the reply is the 521 class scores averaged over every 0.96 s frame of every window.
 */
type Req = { id: number; modelUrl: string; windows: Float32Array[] };
type Res = { id: number; ok: true; scores: Float32Array; names: string[]; frames: number; loadMs: number; classifyMs: number; backend: string } | { id: number; ok: false; error: string };

let ready: Promise<{ tf: typeof import('@tensorflow/tfjs-core'); model: import('@tensorflow/tfjs-converter').GraphModel; names: string[]; loadMs: number; backend: string }> | null = null;

function load(modelUrl: string) {
  if (ready) return ready;
  ready = (async () => {
    const t0 = performance.now();
    const tf = await import('@tensorflow/tfjs-core'); const conv = await import('@tensorflow/tfjs-converter');
    await import('@tensorflow/tfjs-backend-cpu');
    let backend = 'cpu';
    try { if (typeof OffscreenCanvas !== 'undefined') { await import('@tensorflow/tfjs-backend-webgl'); if (await tf.setBackend('webgl')) backend = 'webgl'; } } catch { /* no WebGL here: CPU */ }
    if (backend !== 'webgl') await tf.setBackend('cpu');
    await tf.ready();
    const [model, names] = await Promise.all([conv.loadGraphModel(modelUrl), fetch(new URL('classes.json', new URL(modelUrl, self.location.href))).then(r => { if (!r.ok) throw new Error(`classes ${r.status}`); return r.json() as Promise<string[]>; })]);
    return { tf, model, names, loadMs: Math.round(performance.now() - t0), backend };
  })();
  ready.catch(() => { ready = null; });
  return ready;
}

self.onmessage = async (e: MessageEvent<Req>) => {
  const { id, modelUrl, windows } = e.data;
  try {
    const { tf, model, names, loadMs, backend } = await load(modelUrl);
    const t0 = performance.now(); const sum = new Float32Array(521); let frames = 0;
    for (let w of windows) {
      if (w.length < 16000) { const pad = new Float32Array(16000); pad.set(w); w = pad; } /* YAMNet needs one 0.96 s frame */
      const input = tf.tensor1d(w); const out = model.execute(input, 'Identity') as import('@tensorflow/tfjs-core').Tensor;
      const d = await out.data() as Float32Array; input.dispose(); out.dispose();
      const n = Math.floor(d.length / 521); for (let i = 0; i < n * 521; i++) sum[i % 521] += d[i]; frames += n;
    }
    for (let i = 0; i < 521; i++) sum[i] /= Math.max(1, frames);
    const res: Res = { id, ok: true, scores: sum, names, frames, loadMs, classifyMs: Math.round(performance.now() - t0), backend };
    (self as unknown as Worker).postMessage(res, [sum.buffer]);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, ok: false, error: String((err as Error)?.message ?? err) } satisfies Res);
  }
};
