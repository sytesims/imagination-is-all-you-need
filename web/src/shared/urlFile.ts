/**
 * Files from URLs the app serves (moved out of ui/next/ImageCanvas.tsx, 2026-10-24, so the Canvas bar sends board media the same way).
 */
/** An image URL as a File the bar can send (PNG / JPG). A grid thumbnail URL (/api/media/thumb?url=…) means its full-size original;
 *  other image types (WEBP, AVIF…) are redrawn as PNG. */
export async function urlToFile(url: string, name?: string): Promise<File> {
  let u = url; try { const x = new URL(url, location.origin); if (x.origin === location.origin && x.pathname === '/api/media/thumb' && x.searchParams.get('url')) u = x.searchParams.get('url')!; } catch { /* keep */ }
  const r = await fetch(u); if (!r.ok) throw new Error(`HTTP ${r.status}`); let b = await r.blob(); if (!/^image\//.test(b.type) && !/\.(png|jpe?g|webp)(\?|$)/i.test(u)) throw new Error('not an image');
  if (!/^image\/(png|jpeg)$/.test(b.type)) { const bmp = await createImageBitmap(b); const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height; c.getContext('2d')!.drawImage(bmp, 0, 0); b = await new Promise<Blob>((res, rej) => c.toBlob(x => x ? res(x) : rej(new Error('encode failed')), 'image/png')); }
  const base = (name ?? u.split('?')[0].split('/').pop() ?? 'image').replace(/\.\w+$/, '') || 'image';
  return new File([b], `${base}.${b.type === 'image/jpeg' ? 'jpg' : 'png'}`, { type: b.type });
}

/** Any media URL the app serves (a clip, a sound, an image) as a File for a job form. Images go through urlToFile (PNG / JPG). */
export async function mediaToFile(url: string, kind: 'image' | 'video' | 'audio', name?: string): Promise<File> {
  if (kind === 'image') return urlToFile(url, name);
  const r = await fetch(url); if (!r.ok) throw new Error(`HTTP ${r.status}`); const b = await r.blob();
  const ext = (url.split('?')[0].split('.').pop() ?? '').toLowerCase(); const base = (name ?? url.split('?')[0].split('/').pop() ?? kind).replace(/\.\w+$/, '') || kind;
  const type = b.type && b.type !== 'application/octet-stream' ? b.type : kind === 'video' ? `video/${ext === 'webm' ? 'webm' : ext === 'mov' ? 'quicktime' : 'mp4'}` : `audio/${ext === 'wav' ? 'wav' : ext === 'ogg' ? 'ogg' : 'mpeg'}`;
  return new File([b], `${base}.${ext || (kind === 'video' ? 'mp4' : 'mp3')}`, { type });
}
