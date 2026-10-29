/** Grid placeholders are temporary: a later load/source must be allowed to recover.
 * Players with their own error UI handle classification and retries themselves. */
export function installMediaFallback(doc: Document): () => void {
  const media = (e: Event) => {
    const t = e.target;
    if (!(t instanceof HTMLImageElement || t instanceof HTMLVideoElement || t instanceof HTMLSourceElement)) return null;
    return t instanceof HTMLSourceElement ? t.parentElement as HTMLVideoElement | null : t;
  };
  const clear = (e: Event) => {
    const el = media(e); if (!el) return;
    delete el.dataset.ohfBroken; el.classList.remove('media-broken');
    const host = el.parentElement;
    if (!host?.querySelector('.media-broken')) host?.classList.remove('media-broken-host');
  };
  const fail = (e: Event) => {
    const el = media(e); if (!el || el.hasAttribute('data-media-error-handled')) return;
    if (el instanceof HTMLVideoElement && (!el.error || el.error.code === 1)) return;
    const src = el.currentSrc || el.src || '';
    if (!/\/files\//.test(src) && !/\/api\/media\/thumb\?url=%2Ffiles%2F/i.test(src)) return;
    el.dataset.ohfBroken = '1'; el.classList.add('media-broken'); el.parentElement?.classList.add('media-broken-host');
  };
  doc.addEventListener('error', fail, true);
  const recovery = ['loadstart', 'load', 'loadeddata'];
  recovery.forEach(n => doc.addEventListener(n, clear, true));
  return () => { doc.removeEventListener('error', fail, true); recovery.forEach(n => doc.removeEventListener(n, clear, true)); };
}
