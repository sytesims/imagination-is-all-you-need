/**
 * Image to vector (2026-11-03): a PNG picture of an SVG result, made in the browser. The SVG is drawn through <img> (same origin, no script runs) onto
 * a canvas at its own size (capped at 4096 px on the long side), transparency kept. Used by "Download PNG", so a vector can go to tools that take pictures.
 */
const MAX = 4096;
export async function svgToPngBlob(url: string): Promise<Blob> {
  const img = new Image(); img.decoding = 'async'; img.src = url; await img.decode();
  const w0 = img.naturalWidth || 1024, h0 = img.naturalHeight || 1024; const k = Math.min(1, MAX / Math.max(w0, h0));
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w0 * k)); c.height = Math.max(1, Math.round(h0 * k));
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return await new Promise<Blob>((ok, no) => c.toBlob((b) => (b ? ok(b) : no(new Error('png'))), 'image/png'));
}
export async function downloadSvgAsPng(url: string, name: string) {
  const b = await svgToPngBlob(url); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
