import { plainCopy } from './plainCopy';

/** Setup writes must have both a successful status and a JSON acknowledgement. */
export async function setupRequest(path: string, init: RequestInit, action: string): Promise<any> {
  try {
    const r = await fetch(path, init); const b = await r.json().catch(() => null);
    if (!r.ok || !b || typeof b !== 'object' || Array.isArray(b)) {
      const detail = plainCopy(String(b?.error ?? (r.ok ? 'The server returned an invalid response.' : `HTTP ${r.status}.`)));
      throw new Error(`${action} ${detail}${/try again/i.test(detail) ? '' : ' Try again.'}`);
    }
    return b;
  } catch (e) {
    if (init.signal?.aborted) throw e;
    if (e instanceof TypeError) throw new Error(`${action} Couldn’t reach the server. Try again.`);
    throw e;
  }
}
export const setupBody = (method: string, body: unknown, signal?: AbortSignal): RequestInit => ({ method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal });
/** The probe's url is a credential-free URL, not HTML display copy. Never run it through plainCopy. */
export function testedComfyUrl(value: unknown): string {
  if (typeof value === 'string') try {
    const u = new URL(value);
    if (/^https?:$/.test(u.protocol) && !u.username && !u.password && !u.search && !u.hash && !/cloud\.comfy\.org|\.run\.comfy\.app/i.test(u.hostname)) return value;
  } catch { /* invalid probe payload */ }
  throw new Error('Couldn’t confirm the tested ComfyUI address. Look again or enter its http(s) address.');
}
