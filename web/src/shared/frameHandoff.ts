/** A Continue click can be repeated while ffmpeg is still working. Share that GET,
 * not a generation request; failures are retried only by an explicit new click. */
export function singleFrameRequests() {
  const pending = new Map<string, Promise<any>>();
  return { get<T>(key: string, load: () => Promise<T>): Promise<T> {
    const old = pending.get(key); if (old) return old;
    const request = Promise.resolve().then(load); pending.set(key, request);
    void request.finally(() => { if (pending.get(key) === request) pending.delete(key); }).catch(() => undefined);
    return request;
  } };
}

export function frameHandoffFailure(error: any): string {
  if (error?.status === 404 || error?.status === 410) return 'That video or frame is no longer available. Choose another result, or try again if it was restored.';
  if (error?.code === 'frame_failed' || error?.code === 'no_frames') return 'The server couldn’t extract a frame from this video. Try again, or choose another clip.';
  if (error?.code === 'decode') return 'This browser couldn’t display the extracted image. Try again, or choose another start image.';
  if (error instanceof TypeError || /network|failed to fetch|load failed/i.test(String(error?.message))) return 'The frame couldn’t be loaded from the server. Check your connection and try again.';
  return 'The last frame couldn’t be loaded. Try again, or choose another start image.';
}

/** Invalidate delivery immediately (before an asynchronous user file decode). */
export function frameDeliveryGuard() {
  let generation = 0;
  return { begin() { const mine = ++generation; return () => mine === generation; }, cancel() { generation++; } };
}
