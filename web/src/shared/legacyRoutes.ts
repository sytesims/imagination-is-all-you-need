/** Pages that were removed, and where their old links land now (pure; tested in server/test/selfhost-redirect.test.ts).
 *  /self-host (2026-10-23): the page is gone; its machine check, ComfyUI address and model downloads live in Settings → Local models,
 *  and its install steps and speed table in the repo docs on GitHub. Every form (/self-host/, /Self-Host, /self-host/anything, any query,
 *  any old #anchor such as #local-setup, #translate or #mac) goes to the one section, so the old query and hash are dropped. */
export const GPU_SETTINGS = '/settings#gpu';
export const selfHostRedirect = (pathname: string): string | null => /^\/self-host(?:\/.*)?$/i.test(pathname.replace(/\/+$/, '') || '/') ? GPU_SETTINGS : null;
