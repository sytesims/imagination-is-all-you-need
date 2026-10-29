/**
 * Layered PSD export (Image to layers, 2026-10-24), built in the browser from the same clean layer files the ZIP has (/files/…?clean=1: no prompt or
 * workflow metadata). Each layer becomes a named PSD layer cut to its visible pixels and placed at its position, bottom first, plus the flattened
 * composite, so it opens as layers in Photoshop, Photopea or Figma's PSD import. Writer: ag-psd (MIT, github.com/Agamnentzar/ag-psd), loaded only when
 * someone downloads a PSD (this module is imported dynamically).
 */
import { writePsdUint8Array, type Psd } from 'ag-psd';
import { compositeLayers, alphaBounds, cropRgba, type Rgba } from './layerCompose';

export type PsdLayerIn = { name: string; image: Rgba; hidden?: boolean };
/** A layered PSD the picture's size: layers bottom first (as given), each named, cropped to its pixels and positioned; the composite as the preview.
 *  A fully transparent layer is kept (empty) so the layer count always matches the result. */
export function buildLayeredPsd(layers: PsdLayerIn[], width: number, height: number): Uint8Array {
  const placed = layers.map((l) => { const im = l.image.width === width && l.image.height === height ? l.image : fit(l.image, width, height); const b = alphaBounds(im);
    return { name: l.name, hidden: !!l.hidden, full: im, box: b, img: b ? cropRgba(im, b) : null }; });
  const psd: Psd = {
    width, height, imageData: compositeLayers(placed.map((p) => ({ image: p.full })), width, height) as any,
    children: placed.map((p) => ({ name: p.name.slice(0, 255), hidden: p.hidden || undefined, ...(p.img && p.box ? { left: p.box[0], top: p.box[1], right: p.box[2], bottom: p.box[3], imageData: p.img as any } : { left: 0, top: 0, right: 0, bottom: 0 }) })),
  };
  return writePsdUint8Array(psd, { generateThumbnail: false, noBackground: true });
}
/** A layer a different size than the picture (rare: a layer the server couldn't place) is put at the top-left, clipped. */
function fit(im: Rgba, W: number, H: number): Rgba {
  const d = new Uint8ClampedArray(W * H * 4); for (let y = 0; y < Math.min(H, im.height); y++) d.set(im.data.subarray(y * im.width * 4, (y * im.width + Math.min(W, im.width)) * 4), y * W * 4);
  return { width: W, height: H, data: d };
}
