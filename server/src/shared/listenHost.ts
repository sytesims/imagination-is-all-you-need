/** Explicit network opt-in only; NODE_ENV never changes the binding. Blank values mean loopback. */
export function listenHost(env: Record<string, string | undefined>, web = false): string {
  return ((web ? env.WEB_HOST : undefined) ?? env.HOST ?? env.OPENHIGGSFIELD_HOST ?? env.OPENJUTSU_HOST ?? '').trim() || '127.0.0.1';
}
