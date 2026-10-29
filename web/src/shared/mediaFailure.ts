/** MediaError is not evidence that a file was deleted. Aborts (including source changes)
 * and errors on a child <track>/<source> are not failures of the current player. */
export type MediaFailure = 'network' | 'decode' | 'unsupported' | 'missing';
export function mediaFailureOf(code?: number): MediaFailure | null {
  return code === 2 ? 'network' : code === 3 ? 'decode' : code === 4 ? 'unsupported' : null;
}

/** Only a real HTTP missing response justifies the missing-file message. HEAD avoids
 * downloading a second copy of a large result. No generation/retry-job API is involved. */
export async function checkMediaFailure(src: string, failure: MediaFailure, signal: AbortSignal): Promise<MediaFailure> {
  try {
    const r = await fetch(src, { method: 'HEAD', cache: 'no-store', signal });
    return r.status === 404 || r.status === 410 ? 'missing' : failure;
  } catch { return failure; }
}
