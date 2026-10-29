/// <reference lib="webworker" />
/**
 * Rig as a character: the skin weights off the page's thread (skin.ts), so the sheet stays responsive on big meshes.
 * In: { id, meshes: SkinInput[] }. Out: { id, step } while it works, then { id, done: SkinOutput[] } or { id, error }.
 */
import { skinWeights, type SkinInput } from './skin';

self.onmessage = (e: MessageEvent<{ id: number; meshes: SkinInput[] }>) => {
  const { id, meshes } = e.data;
  try {
    const out = meshes.map((m, i) => skinWeights(m, (s, of) => (self as unknown as Worker).postMessage({ id, step: (i + s / of) / meshes.length })));
    (self as unknown as Worker).postMessage({ id, done: out }, out.flatMap((o) => [o.skinIndex.buffer, o.skinWeight.buffer]));
  } catch (err) { (self as unknown as Worker).postMessage({ id, error: err instanceof Error ? err.message : String(err) }); }
};
