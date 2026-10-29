import type { NativeOutput } from './native.js';

/** Expand still-image batches only. Other media retain their first-record contract; text is aggregated by the caller.
 * Some transports/test doubles omit kind, so a still-image extension is the conservative fallback.
 * Keep node identity separate from batch position: a second image is not a second extraOutputs node.
 */
export function nativeOutputItems(records: NativeOutput[], imageBatches: boolean, label: string): { output: NativeOutput; label: string; suffix: string }[] {
  const still = (o: NativeOutput) => o.kind === 'images' || (!o.kind && /\.(png|jpe?g|webp)$/i.test(o.filename));
  const selected = imageBatches && records[0] && still(records[0]) ? records.filter(still) : records.slice(0, 1);
  return selected.map((output, k) => ({ output, label: selected.length > 1 ? `${label} ${k + 1}` : label, suffix: selected.length > 1 ? `-${k}` : '' }));
}
